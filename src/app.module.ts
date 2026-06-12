import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { CacheModule } from './cache/cache.module';
import { AuditModule } from './audit/audit.module';
import { TenantsModule } from './tenants/tenants.module';
import { FlagsModule } from './flags/flags.module';
import { EvaluationModule } from './evaluation/evaluation.module';
import { TenantThrottlerGuard } from './common/guards/throttler.guard';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60000, limit: Number(process.env.THROTTLE_LIMIT ?? 100) }]),
    PrismaModule,
    CacheModule,
    AuditModule,
    TenantsModule,
    FlagsModule,
    EvaluationModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: TenantThrottlerGuard,
    },
  ],
})
export class AppModule {}
