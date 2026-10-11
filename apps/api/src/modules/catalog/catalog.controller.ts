import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { Public } from '../auth/public.decorator.js';
import { Roles } from '../auth/roles.guard.js';
import { ContractInput } from '../commands/contract-input.service.js';
import { commandContext, commandResponse } from '../commands/command-http.js';
import { CatalogService } from './catalog.service.js';
import {
  allCategories,
  facetDefinitions,
  languageOptions,
  taxonomyVersion,
} from '@used-books/api-contract/catalog-taxonomy';
@Controller()
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly input: ContractInput,
  ) {}
  @Get('catalog/taxonomy')
  @Public()
  taxonomy() {
    return {
      version: taxonomyVersion,
      categories: allCategories.map(({ id, label, parentId, facets }) => ({
        id,
        label,
        parentId,
        facets,
      })),
      facets: facetDefinitions,
      languages: languageOptions,
    };
  }
  @Get('catalog/books')
  @Public()
  list(@Query() query: unknown) {
    return this.catalog.publicList(this.input.query('listBooks', query));
  }
  @Get('catalog/books/:bookId')
  @Public()
  book(@Param('bookId') id: string) {
    return this.catalog.publicDetail(this.input.uuid(id));
  }
  @Post('catalog/requests')
  @Roles('MEMBER')
  @HttpCode(200)
  create(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.catalog.create(
        commandContext(this.input, req, res),
        this.input.body('CreateCatalogRequest', body),
      ),
      res,
    );
  }
  @Post('catalog/requests/:bookId/resubmit')
  @Roles('MEMBER')
  @HttpCode(200)
  resubmit(
    @Param('bookId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.catalog.resubmit(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('ResubmitCatalogRequest', body),
      ),
      res,
    );
  }
  @Get('me/catalog-requests')
  @Roles('MEMBER')
  mine(@Req() req: AuthenticatedRequest, @Query() query: unknown) {
    return this.catalog.privateList(
      req.auth,
      this.input.query('listMyCatalogRequests', query),
    );
  }
  @Get('me/catalog-requests/:bookId')
  @Roles('MEMBER')
  mineDetail(@Req() req: AuthenticatedRequest, @Param('bookId') id: string) {
    return this.catalog.privateDetail(req.auth, this.input.uuid(id));
  }
  @Get('operations/catalog-requests')
  @Roles('ADMIN')
  queue(@Req() req: AuthenticatedRequest, @Query() query: unknown) {
    return this.catalog.privateList(
      req.auth,
      this.input.query('listCatalogReviewQueue', query),
      true,
    );
  }
  @Get('operations/catalog-requests/:bookId')
  @Roles('ADMIN')
  review(@Req() req: AuthenticatedRequest, @Param('bookId') id: string) {
    return this.catalog.privateDetail(req.auth, this.input.uuid(id), true);
  }
  @Post('operations/catalog-requests/:bookId/decision')
  @Roles('ADMIN')
  @HttpCode(200)
  decide(
    @Param('bookId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.catalog.decide(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('DecideCatalog', body),
      ),
      res,
    );
  }
}
