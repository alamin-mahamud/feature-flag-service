import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { TenantsModule } from './tenants/tenants.module';
import { FlagsModule } from './flags/flags.module';

@Module({
  imports: [PrismaModule, TenantsModule, FlagsModule],
  controllers: [AppController],
})
export class AppModule {}
