import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  AuthProviderId,
  AuthSessionDto,
  LoginInput,
  OAuthProviderId,
  RegisterInput,
  UserDto,
} from '@ratemix/shared';
import { TRPCError } from '@trpc/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import { DAY_MS } from '../common/time';
import { ENV, type Env } from '../config/env';
import { PrismaService } from '../core/prisma.service';
import type { AuthApi, IssuedSession, RequestMeta } from '../trpc/deps';
import { AuthRateLimiter } from './auth-rate-limiter';

const BCRYPT_COST = 11;
const JWT_ISSUER = 'ratemix-api';
const JWT_AUDIENCE = 'ratemix-web';
/** A token rotated this recently by a parallel request (another tab) is not treated as theft. */
const ROTATION_GRACE_MS = 30_000;

export interface OAuthProfile {
  provider: OAuthProviderId;
  accountId: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
}

interface UserRecord {
  id: string;
  email: string | null;
  displayName: string | null;
  authProvider: string;
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

class RotationRaceError extends Error {}

@Injectable()
export class AuthService implements AuthApi {
  private readonly logger = new Logger(AuthService.name);
  private dummyHash: Promise<string> | null = null;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly limiter: AuthRateLimiter,
  ) {}

  async register(input: RegisterInput, meta: RequestMeta): Promise<IssuedSession> {
    await this.limiter.consume('register', meta.ip ?? 'unknown', 5, 3600);
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'An account with this email already exists',
      });
    }
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
    try {
      const user = await this.prisma.user.create({
        data: {
          email: input.email,
          displayName: input.displayName ?? null,
          authProvider: 'password',
          passwordHash,
        },
      });
      return this.issueSession(user, meta);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'An account with this email already exists',
        });
      }
      throw error;
    }
  }

  async login(input: LoginInput, meta: RequestMeta): Promise<IssuedSession> {
    await this.limiter.consume('login', `${meta.ip ?? 'unknown'}:${input.email}`, 10, 15 * 60);
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    // Always run bcrypt so response time doesn't reveal whether the email exists.
    const valid = await bcrypt.compare(
      input.password,
      user?.passwordHash ?? (await this.getDummyHash()),
    );
    if (!user?.passwordHash || !valid) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Email or password is incorrect' });
    }
    return this.issueSession(user, meta);
  }

  /**
   * Rotates the refresh token. Presenting an already-rotated token outside the grace
   * window is treated as token theft: every session for that user is revoked.
   */
  async refresh(rawToken: string | undefined, meta: RequestMeta): Promise<IssuedSession | null> {
    if (!rawToken) return null;
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(rawToken) },
      include: { user: true },
    });
    if (!record) return null;
    const now = new Date();

    if (record.revokedAt) {
      if (record.replacedById && now.getTime() - record.revokedAt.getTime() < ROTATION_GRACE_MS) {
        return { session: this.accessSession(record.user, now), refreshToken: null };
      }
      await this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      this.logger.warn(
        { userId: record.userId },
        'Refresh token reuse detected; revoked all sessions',
      );
      return null;
    }
    if (record.expiresAt <= now) return null;

    const next = this.newRefreshToken(now);
    try {
      await this.prisma.$transaction(async (tx) => {
        const created = await tx.refreshToken.create({
          data: {
            userId: record.userId,
            tokenHash: next.hash,
            expiresAt: next.expiresAt,
            userAgent: meta.userAgent?.slice(0, 255) ?? null,
          },
        });
        const revoked = await tx.refreshToken.updateMany({
          where: { id: record.id, revokedAt: null },
          data: { revokedAt: now, replacedById: created.id },
        });
        if (revoked.count === 0) throw new RotationRaceError();
      });
    } catch (error) {
      if (error instanceof RotationRaceError) {
        return { session: this.accessSession(record.user, now), refreshToken: null };
      }
      throw error;
    }
    return {
      session: this.accessSession(record.user, now),
      refreshToken: { value: next.raw, expiresAt: next.expiresAt },
    };
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashRefreshToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async getUser(userId: string): Promise<UserDto | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return user ? toUserDto(user) : null;
  }

  /** Returns the user ID for a valid access token, otherwise null. */
  verifyAccessToken(token: string): { id: string } | null {
    try {
      const payload = jwt.verify(token, this.env.JWT_ACCESS_SECRET, {
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });
      return typeof payload === 'object' && typeof payload.sub === 'string'
        ? { id: payload.sub }
        : null;
    } catch {
      return null;
    }
  }

  /**
   * Signs in (or signs up) an OAuth user. Accounts are never linked by email
   * automatically: that would let someone who pre-registered a victim's email with
   * a password take over the account once the victim uses OAuth.
   */
  async loginWithOAuth(profile: OAuthProfile, meta: RequestMeta): Promise<IssuedSession> {
    const existing = await this.prisma.user.findUnique({
      where: {
        authProvider_providerAccountId: {
          authProvider: profile.provider,
          providerAccountId: profile.accountId,
        },
      },
    });
    if (existing) return this.issueSession(existing, meta);

    const email = profile.email && profile.emailVerified ? profile.email.toLowerCase() : null;
    if (email) {
      const clash = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (clash) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'An account with this email already exists',
        });
      }
    }
    const user = await this.prisma.user.create({
      data: {
        email,
        displayName: profile.displayName,
        authProvider: profile.provider,
        providerAccountId: profile.accountId,
      },
    });
    return this.issueSession(user, meta);
  }

  private async issueSession(user: UserRecord, meta: RequestMeta): Promise<IssuedSession> {
    const now = new Date();
    const token = this.newRefreshToken(now);
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: token.hash,
        expiresAt: token.expiresAt,
        userAgent: meta.userAgent?.slice(0, 255) ?? null,
      },
    });
    return {
      session: this.accessSession(user, now),
      refreshToken: { value: token.raw, expiresAt: token.expiresAt },
    };
  }

  private accessSession(user: UserRecord, now: Date): AuthSessionDto {
    const ttl = this.env.ACCESS_TOKEN_TTL_SECONDS;
    const accessToken = jwt.sign({}, this.env.JWT_ACCESS_SECRET, {
      algorithm: 'HS256',
      subject: user.id,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      expiresIn: ttl,
    });
    return {
      user: toUserDto(user),
      accessToken,
      accessTokenExpiresAt: new Date(now.getTime() + ttl * 1000).toISOString(),
    };
  }

  private newRefreshToken(now: Date): { raw: string; hash: string; expiresAt: Date } {
    const raw = randomBytes(32).toString('base64url');
    return {
      raw,
      hash: hashRefreshToken(raw),
      expiresAt: new Date(now.getTime() + this.env.REFRESH_TOKEN_TTL_DAYS * DAY_MS),
    };
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= bcrypt.hash(randomBytes(16).toString('hex'), BCRYPT_COST);
    return this.dummyHash;
  }
}

function toUserDto(user: UserRecord): UserDto {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    authProvider: user.authProvider as AuthProviderId,
  };
}
