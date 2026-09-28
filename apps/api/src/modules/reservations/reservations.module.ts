import { Module } from '@nestjs/common';
import { ReservationsService } from './reservations.service.js';
@Module({ providers: [ReservationsService], exports: [ReservationsService] })
export class ReservationsModule {}
