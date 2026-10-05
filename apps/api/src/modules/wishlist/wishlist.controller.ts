import { Body, Controller, Delete, Get, HttpCode, Param, Put, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.guard.js';
import { ContractInput } from '../commands/contract-input.service.js';
import { WishlistService } from './wishlist.service.js';

@Controller('me/wishlist')
@Roles('MEMBER')
export class WishlistController {
  constructor(
    private readonly service: WishlistService,
    private readonly input: ContractInput,
  ) {}

  @Get()
  read(@Req() req: AuthenticatedRequest) {
    const query = this.input.query('getMyWishlist', req.query);
    return this.service.read(req.auth.user, {
      cursor: query.cursor as string | undefined,
      limit: query.limit as number,
      subjectType: query.subjectType as string | undefined,
    });
  }

  @Put('catalog-books/:bookId')
  saveBook(
    @Param('bookId') bookId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.save(
      req.auth.user,
      'CATALOG_BOOK',
      this.input.uuid(bookId),
      this.input.body('SaveWishlistRequest', body),
    );
  }

  @Delete('catalog-books/:bookId')
  @HttpCode(204)
  removeBook(
    @Param('bookId') bookId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.remove(req.auth.user, 'CATALOG_BOOK', this.input.uuid(bookId));
  }

  @Put('listings/:listingId')
  saveListing(
    @Param('listingId') listingId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.save(
      req.auth.user,
      'LISTING',
      this.input.uuid(listingId),
      this.input.body('SaveWishlistRequest', body),
    );
  }

  @Delete('listings/:listingId')
  @HttpCode(204)
  removeListing(
    @Param('listingId') listingId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.remove(req.auth.user, 'LISTING', this.input.uuid(listingId));
  }
}
