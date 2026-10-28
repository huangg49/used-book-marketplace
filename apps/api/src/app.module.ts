import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { AutofillAssistModule } from './modules/autofill-assist/autofill-assist.module.js';
import { ListingsModule } from './modules/listings/listings.module.js';
import { validateEnvironment } from './config/environment.js';
import { MediaModule } from './modules/media/media.module.js';
import { AddressesModule } from './modules/addresses/addresses.module.js';
import { QuotesModule } from './modules/quotes/quotes.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { WalletModule } from './modules/wallet/wallet.module.js';
import { ShipmentsModule } from './modules/shipments/shipments.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { WishlistModule } from './modules/wishlist/wishlist.module.js';
import { AuctionsModule } from './modules/auctions/auctions.module.js';
import { PurchasesModule } from './modules/purchases/purchases.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { ExchangesModule } from './modules/exchanges/exchanges.module.js';
import { ReviewsModule } from './modules/reviews/reviews.module.js';
import { OperationsDashboardModule } from './modules/operations-dashboard/operations-dashboard.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    DatabaseModule,
    AuthModule,
    CatalogModule,
    ListingsModule,
    AutofillAssistModule,
    MediaModule,
    AddressesModule,
    QuotesModule,
    OrdersModule,
    WalletModule,
    ShipmentsModule,
    UsersModule,
    WishlistModule,
    AuctionsModule,
    PurchasesModule,
    NotificationsModule,
    ExchangesModule,
    ReviewsModule,
    OperationsDashboardModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
