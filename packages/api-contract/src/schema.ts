// Generated from openapi.yaml. Run pnpm contract:generate.
export interface paths {
    "/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getHealth"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/health/ready": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getReadiness"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/register": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Normalized unique email; creates only an unverified MEMBER. Existing accounts receive the same acknowledgement and are never overwritten. Password 10..128 characters. Simulation rules acknowledgement required. Verification link valid 30 minutes. */
        post: operations["registerAccount"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/verification/resend": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Generic acknowledgement for all email addresses. Only unverified accounts receive mail. Minimum 60 seconds between links; issuing a new link invalidates all previous verification links. */
        post: operations["resendEmailVerification"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/verify-email": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Consume an unexpired single-use verification token and activate the account atomically. No session is created. */
        post: operations["verifyEmail"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/forgot-password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Identical acknowledgement for existing and unknown accounts. Single-use reset link valid 15 minutes. Minimum 60 seconds between links. */
        post: operations["requestPasswordReset"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/reset-password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Consume a reset token once, replace the password and revoke all sessions atomically. Does not change status or grant roles. No automatic login. */
        post: operations["resetPassword"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/otp/register": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Creates only an unverified MEMBER. Generic challenge acknowledgement for duplicates; credentials never overwritten. Six-digit verification code valid 5 minutes, five wrong attempts, 60-second resend cooldown. No session created. */
        post: operations["registerAccountWithOtp"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/otp/request": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Generic response for unknown, ineligible and cooldown requests. Eligible accounts receive a new code, invalidating prior codes and links of the same purpose. Cooldown requests never expose or invalidate the active challenge. Five-minute expiry and 60-second cooldown enforced by server time. */
        post: operations["requestAccountOtp"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/otp/verify-email": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Atomically consume the challenge and activate an unverified account. Five failed code attempts lock that challenge; parallel requests cannot exceed the budget. No automatic login. OTP_INVALID or OTP_ATTEMPTS_EXCEEDED on failure. */
        post: operations["verifyEmailWithOtp"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/otp/reset-password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Atomically consume the reset challenge, replace password and revoke every session. Existing status and roles retained. No automatic login. Same five-attempt budget and OTP error codes as verification. */
        post: operations["resetPasswordWithOtp"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Sign in with a verified, active or restricted account. Limited to 5 attempts per account and IP per fixed 15-minute window. Verified LOCKED users may authenticate/rotate/read profile for existing obligations; protected routes remain deny-by-default for LOCKED. Status and roles are rechecked from DB. */
        post: operations["login"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Rotate the refresh token once. Concurrent reuse has one winner. Session expiry is absolute. Verified LOCKED users may authenticate/rotate/read profile for existing obligations; protected routes remain deny-by-default for LOCKED. Status and roles are rechecked from DB. */
        post: operations["refreshSession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Revoke using the current refresh token, even when access has expired. Repeated requests are harmless. */
        post: operations["logout"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Verified LOCKED users may authenticate/rotate/read profile for existing obligations; protected routes remain deny-by-default for LOCKED. Status and roles are rechecked from DB. */
        get: operations["getCurrentUser"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/catalog/taxonomy": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Versioned category tree and contextual vocabulary */
        get: operations["getCatalogTaxonomy"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/catalog/books": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * listBooks
         * @description Confirmed catalog only, ordered by normalized title then id ASC. No private catalog request metadata.
         */
        get: operations["listBooks"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/catalog/books/{bookId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * getBook
         * @description Confirmed only; otherwise 404. Related listings use GET /listings?bookId=... .
         */
        get: operations["getBook"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/catalog/requests": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * createCatalogRequest
         * @description Verified ACTIVE MEMBER. Creates Pending book + immutable request revision. ISBN collision with Confirmed returns 409 CatalogDuplicate (client queries public ISBN). Never disclose another private request.
         */
        post: operations["createCatalogRequest"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/catalog-requests": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * listMyCatalogRequests
         * @description Requester only, ACTIVE/RESTRICTED session. updatedAt,id DESC.
         */
        get: operations["listMyCatalogRequests"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/catalog-requests/{bookId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * getMyCatalogRequest
         * @description Requester only; unrelated ID 404.
         */
        get: operations["getMyCatalogRequest"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/catalog/requests/{bookId}/resubmit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * resubmitCatalogRequest
         * @description ACTIVE requester; Rejected only. New immutable revision, Pending; previous decisions preserved.
         */
        post: operations["resubmitCatalogRequest"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/operations/catalog-requests": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * listCatalogReviewQueue
         * @description ACTIVE ADMIN only; default Pending. createdAt,id ASC. No self-decision.
         */
        get: operations["listCatalogReviewQueue"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/operations/catalog-requests/{bookId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * getCatalogReview
         * @description ACTIVE ADMIN only.
         */
        get: operations["getCatalogReview"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/operations/catalog-requests/{bookId}/decision": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * decideCatalogRequest
         * @description ACTIVE ADMIN independent of requester. Pending + exact revision/version. Confirm sets canonical ISBN unique across Confirmed; conflict 409, never auto-merge.
         */
        post: operations["decideCatalogRequest"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/listings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * listPublicListings
         * @description Eligible public projection only. No-store. Full eligibility is evaluated in one database snapshot per page, with no cross-page snapshot guarantee.
         */
        get: operations["listPublicListings"];
        put?: never;
        /**
         * createListingDraft
         * @description Verified ACTIVE MEMBER. Creates Draft/Visible/Available and first working revision. Does not create custody verification. Initial mediaIds must be empty. Create the draft before uploading photos; saved drafts can refer only to existing, eligible assets owned by this listing.
         */
        post: operations["createListingDraft"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/listings/{listingId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * getPublicListing
         * @description Same predicate as search; all ineligible states return generic 404, including owner requests. Private reads use /me or /operations.
         */
        get: operations["getPublicListing"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/listings/{listingId}/purchase-conversations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Start the 24-hour buyer-seller conversation for one sale listing */
        post: operations["createPurchaseConversation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/purchase-conversations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listMyPurchaseConversations"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/notifications": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description The caller's durable inbox (FR-N03/N04), newest first. Rows are written in the same transaction as the event they report; realtime pages only refresh this list. Text carries public prices, states and deadlines only. */
        get: operations["listMyNotifications"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/notifications/read": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Marks the caller's notifications read, either the listed ids or all of them. Ids that are not the caller's are ignored. The operation is naturally idempotent (only unread rows change), so a retry with the same key and body has the same effect; no receipt is stored for it. */
        post: operations["markMyNotificationsRead"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/purchase-conversations/{conversationId}/messages": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listPurchaseMessages"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/listings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * listMyListings
         * @description Owner ACTIVE/RESTRICTED, excludes soft-deleted; updatedAt,id DESC.
         */
        get: operations["listMyListings"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/listings/{listingId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * getMyListing
         * @description Owner only, ACTIVE/RESTRICTED; deleted/unrelated 404.
         */
        get: operations["getMyListing"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/listings/{listingId}/revisions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * listMyListingRevisions
         * @description Owner only, includes all historical content, number DESC. Submitted revisions are immutable.
         */
        get: operations["listMyListingRevisions"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/listings/{listingId}/draft": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * saveListingDraft
         * @description ACTIVE owner, Draft/Rejected, Available, nonremoved/nondeleted. Full replace. Editing Rejected creates a new working revision. No edits to PendingReview.
         */
        put: operations["saveListingDraft"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/listings/{listingId}/submit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * submitListing
         * @description ACTIVE owner, Draft/Rejected; validate saved content as SubmittedContent, Ready media, declaration and accessible catalog; freeze revision, PendingReview. Resubmitting Rejected creates a new revision even when unchanged. Default submission fee is 20000 VND held from the owner wallet in the same transaction; insufficient funds reject submission. Rejection refunds that revision fee; approval settles it. Historical submissions are not charged retroactively.
         */
        post: operations["submitListing"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/listings/{listingId}/revision": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * reviseApprovedListing
         * @description ACTIVE owner; Approved and Available. Validate full replacement and declaration, create frozen revision + PendingReview atomically, preserve visibility. Old approved content stops public display.
         */
        post: operations["reviseApprovedListing"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/listings/{listingId}/price-suggestions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * requestPriceSuggestion
         * @description ACTIVE owner; Draft/Rejected, or Approved and Available (approved edit). Advisory sale-price range from sourced price references only; never a verified or reference price and never written to the listing. Input is the unsaved form; server checks the catalog book (confirmed, or the caller's own pending request). A listing with no Ready photo gets NeedsMoreData (R-NEED-PHOTO) without a model call. A book without a recent online price starts one background lookup; while it runs and no other source exists the answer is NeedsMoreData (R-LOOKUP-PENDING). Evidence level and refusal are decided by fixed rules; the model only drafts range/factors, which are checked against the evidence and POL-16. Same listing + input + reference set returns the stored suggestion (cached=true) without a new model call. Idempotency-Key is one per ask: a retry with the same key and body returns that request's suggestion (cached=true) or its stored failure (503); same key with another listing/body is 409 IdempotencyConflict. 429 per-user/per-listing limits or a request still running; 503 when the assistant is disabled, over budget, times out or returns invalid output. Clients keep manual pricing in every failure. No address, account, session or token data is sent to the provider.
         */
        post: operations["requestPriceSuggestion"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/listings/{listingId}/visibility": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * setListingVisibility
         * @description Owner, Approved + Available, no reservation. Hide permits ACTIVE/RESTRICTED; reopen ACTIVE only and catalog/media eligible. Removed/deleted never restored.
         */
        put: operations["setListingVisibility"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/listings/{listingId}/archive": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * archiveListing
         * @description Owner ACTIVE/RESTRICTED, Available, no active obligation. Soft delete only; no physical file/history deletion. Removed/deleted cannot be newly mutated; valid key replay still returns receipt.
         */
        post: operations["archiveListing"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/operations/listings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * listListingReviewQueue
         * @description ACTIVE STAFF/ADMIN, default PendingReview; submittedAt,id ASC; excludes deleted/Removed; pending catalog indicated by catalogStatus. Only submitted current revisions are listed; private working drafts are excluded.
         */
        get: operations["listListingReviewQueue"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/operations/users": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List user directory
         * @description ACTIVE ADMIN only. Read-only operational directory ordered by createdAt,id DESC. Searches the normalized email or display name; filters and cursors are bound to the current Admin. Account state and role changes are deliberately not exposed by this API.
         */
        get: operations["listOperationsUsers"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/operations/listings/{listingId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * getListingReview
         * @description ACTIVE STAFF/ADMIN for moderation task. Deleted or unsubmitted current revision returns 404; Removed submitted content remains readable.
         */
        get: operations["getListingReview"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/operations/listings/{listingId}/revisions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * listReviewRevisions
         * @description ACTIVE STAFF/ADMIN; number DESC, submitted revisions only; unsubmitted drafts are private. Owner ID does not grant review decision permission.
         */
        get: operations["listReviewRevisions"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/operations/listings/{listingId}/decision": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * decideListing
         * @description ACTIVE STAFF/ADMIN independent of owner. PendingReview, exact version/revision; approve rechecks Confirmed catalog, owner eligibility, Ready photos and checklist. Reject requires reason, allowed when owner is now restricted. One winner per revision.
         */
        post: operations["decideListing"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/operations/listings/{listingId}/remove": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * removeListing
         * @description ACTIVE independent STAFF/ADMIN, reason mandatory; only listings with a submitted current revision. No active trade/obligation in this increment: unsupported states 409. Never change trade or release a reservation.
         */
        post: operations["removeListing"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/listings/{listingId}/media": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * createListingUpload
         * @description ACTIVE owner; editable Draft/Rejected/Approved, Available, nonremoved/nondeleted. Creates unattached Pending media; expectedVersion is LISTING version. 8 nonterminal and 80 retained assets/listing, 20 intents/hour/actor, global storage reservation cap. Does not change listing version. Receipt entity Media.
         */
        post: operations["createListingUpload"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/listings/{listingId}/media": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * listMyListingMedia
         * @description Owner ACTIVE/RESTRICTED; createdAt,id DESC; includes unattached assets until purged.
         */
        get: operations["listMyListingMedia"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/listings/{listingId}/media/{mediaId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * getMyListingMedia
         * @description Owner ACTIVE/RESTRICTED. Poll Processing with backoff; terminal Failed needs a new intent.
         */
        get: operations["getMyListingMedia"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/listings/{listingId}/media/{mediaId}/upload-ticket": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * getUploadTicket
         * @description ACTIVE owner, Pending, editable listing, intent unexpired. Returns a relative API upload path and a session-bound token valid at most 600 seconds. Upload requires the same authenticated session. No Supabase credentials reach the client.
         */
        get: operations["getUploadTicket"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/listings/{listingId}/media/{mediaId}/finalize": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * finalizeListingUpload
         * @description ACTIVE owner, expectedVersion is MEDIA version. Requires bytes already acknowledged by uploadListingContent. Atomically marks Processing and creates durable job. Worker validates immutable input and writes sanitized derivative before Ready. 409 UploadIncomplete if bytes are absent. Processing is not success.
         */
        post: operations["finalizeListingUpload"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/listings/{listingId}/media/{mediaId}/read": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * getPublicListingMedia
         * @description Only media in the CURRENT eligible public revision. Otherwise generic 404. Rechecks the full listing/owner predicate after remote signing; 120-second derivative URL. Previously issued URLs can remain usable until expiry.
         */
        get: operations["getPublicListingMedia"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/listings/{listingId}/media/{mediaId}/read": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * getMyListingMediaRead
         * @description Owner ACTIVE/RESTRICTED, Ready nonpurged media in own nondeleted listing. Only sanitized derivative is served, with a 120-second signed URL; never original bytes.
         */
        get: operations["getMyListingMediaRead"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/operations/listings/{listingId}/media/{mediaId}/read": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * getReviewMediaRead
         * @description ACTIVE STAFF/ADMIN, Ready media linked to a submitted revision of this listing; no access to arbitrary unattached upload. Audit access before signing.
         */
        get: operations["getReviewMediaRead"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/listings/{listingId}/media/{mediaId}/content": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Upload immutable image bytes
         * @description Authenticated bounded binary upload through NestJS to private Supabase Storage. Exact declared length, MIME and SHA-256 checked before storage. Idempotency-Key applies to acknowledgement; use the same key on retry. Same media ID can only accept its declared bytes. Returns Media receipt; refetch MEDIA version before finalize. Storage calls occur outside DB transactions and authorization is rechecked before acknowledgement. Upload-Token comes from getUploadTicket. 2 concurrent uploads/API process; maximum body 10MB and timeout 120s.
         */
        put: operations["uploadListingContent"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/service-areas": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getServiceAreaDirectory"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/wishlist": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getMyWishlist"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/wishlist/catalog-books/{bookId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: operations["saveBookToWishlist"];
        post?: never;
        delete: operations["removeBookFromWishlist"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/wishlist/listings/{listingId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: operations["saveListingToWishlist"];
        post?: never;
        delete: operations["removeListingFromWishlist"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/addresses": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getMyAddressBook"];
        put?: never;
        post: operations["createMyAddress"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/addresses/{addressId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: operations["updateMyAddress"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/addresses/{addressId}/default": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["setMyDefaultAddress"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/addresses/{addressId}/archive": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["deleteMyAddress"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/listings/{listingId}/quotes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description ACTIVE verified MEMBER, not seller; Sale/Both listing, current private destination and seller origin in HCM. Server calculates amounts; 5-minute policy expiry starts after locks. At most 20 unexpired quotes per buyer. No stock/money/listing mutation. Same key replays original receipt after expiry or listing/address changes; use GET for current assessment. */
        post: operations["createSaleQuote"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/quotes/{quoteId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Buyer only, ACTIVE/RESTRICTED MEMBER. Other participants and staff receive 404 when they have MEMBER access; staff without MEMBER receive 403. Expiry at serverTime >= expiresAt; expired takes precedence, then Unavailable (eligibility), then Changed (versions/policy/address). Reads never renew expiry. Locked/revoked sessions cannot read/replay. */
        get: operations["getMySaleQuote"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Default Wallet checkout atomically creates the Order and holds the server quote total P+S from the buyer wallet; insufficient funds leave no Order or reservation. Returns PendingSellerConfirmation version 2. Configured legacy Unpaid mode retains AwaitingPayment and the separate pay command. Same key/body returns the original receipt and never charges twice. */
        post: operations["createDirectOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/orders/{orderId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Private participant Order, including payment/hold and refund progress; own contact only. LOCKED existing-obligation access. No seller acceptance/dispatch yet. */
        get: operations["getMyOrder"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/orders/{orderId}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Buyer only, ACTIVE/RESTRICTED MEMBER; current version and decision time strictly before paymentDeadline. Releases only its own Active commitment and preserves listing moderation/visibility. At/after deadline conflict; internal expiry worker performs PaymentExpired. Same key replays original receipt; no refund is created. Verified LOCKED MEMBER may use this operation for owned/participating existing records. Current session, role, ownership and state are rechecked. Foreign records remain 404. */
        post: operations["cancelUnpaidOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/orders/{orderId}/media/{mediaId}/read": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Current participant MEMBER session and pinned item media only, including Reserved/closed Orders. No seller/buyer contact exposed. Signed derivative TTL is 120 seconds. Recheck authorization after external signing; a URL already issued may remain usable until expiry. Verified LOCKED MEMBER may use this operation for owned/participating existing records. Current session, role, ownership and state are rechecked. Foreign records remain 404. */
        get: operations["getMyOrderMedia"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/wallet": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Derived simulated available + transaction-held balance. LOCKED may read, but cannot pay. Withdrawal not implemented. A payment capability is not a checkout UI release gate. */
        get: operations["getMyWallet"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/topups/vnpay": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Create a VNPay sandbox wallet topup
         * @description Verified Member; LOCKED denied. No credit until a signed IPN or server-verified QueryDR result is applied. Same key/body replays the original payment URL and deadline. Sandbox only; finite demo clearing source remains enforced.
         */
        post: operations["createVNPayTopup"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/topups/{topupId}/vnpay-query": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Verify an owned VNPay sandbox topup using QueryDR
         * @description Existing obligation, including LOCKED Members. Owner and current session are checked before the outbound provider query and again before applying its result. No client payment evidence or amount is accepted. Only a signed successful payment of the original amount may credit the original wallet; a pending, unconfirmed or non-successful query leaves the intent unchanged. Repeated queries and concurrent IPN deliveries cannot credit twice. Provider outages or invalid evidence return 503 without changing the wallet. Does not create or fund an Order.
         */
        post: operations["queryMyVNPayTopup"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payments/vnpay/ipn": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Receive a signed VNPay sandbox payment result
         * @description Public server callback authenticated by HMAC-SHA512, merchant, amount and transaction reference. Return URL never credits a wallet. Duplicate callbacks do not credit twice; late valid payments may fund only their original wallet. Does not create or fund an Order.
         */
        get: operations["receiveVNPayIpn"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/topups": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Private descending keyset history. Includes credited intents subsequently flagged ReviewRequired. Verified LOCKED MEMBER may use this operation for owned/participating existing records. Current session, role, ownership and state are rechecked. Foreign records remain 404. */
        get: operations["listMyTopups"];
        put?: never;
        /** @description Create a simulated pending intent; no credit and no automatic Order funding. At most ten unresolved intents per owner. Requires configured simulator; ACTIVE/RESTRICTED MEMBER. LOCKED is rejected with 403 before any receipt replay or mutation. */
        post: operations["createTopupIntent"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/topups/{topupId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Private owned intent; foreign or missing ID returns 404. Verified LOCKED MEMBER may use this operation for owned/participating existing records. Current session, role, ownership and state are rechecked. Foreign records remain 404. */
        get: operations["getMyTopup"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/wallet/history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Private available-account journals: topup, payment debit, completed refund credit. BalanceAfter includes all preceding posted entries before filters. History ordered by immutable posting sequence. Pending refund is visible on Order, never as posted credit. */
        get: operations["listMyWalletHistory"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/operations/simulator/topup-events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description ACTIVE TEST_OPERATOR only, independent of recipient. No ADMIN/STAFF shortcut. Enabled only with server PAYMENT_SIMULATOR_SECRET in development/test. Event identity is global across operators/HTTP keys. Contradictory new events freeze intent in ReviewRequired; a reused ID with different content returns 409. No account adjustment API. LOCKED is rejected with 403 before any receipt replay or mutation. */
        post: operations["emitSimulatedTopupEvent"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Participant MEMBER unpaid Order history, including verified LOCKED. Descending keyset pagination. Does not expose counterparty identity/contact or infer payment capability. Enables recovery without a locally retained order ID. */
        get: operations["listMyOrders"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/orders/{orderId}/pay": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Buyer ACTIVE/RESTRICTED only; LOCKED denied. Seller must remain verified MEMBER ACTIVE/RESTRICTED. Atomic full frozen buyerTotal available-to-OrderHold transfer before payment deadline; no new source credit or partial payment. Same key replays original receipt. Starts fixed 48-hour confirmation deadline. Seller acceptance remains planned. */
        post: operations["payOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/orders/{orderId}/cancel-paid": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Buyer only, including LOCKED existing obligations. Before seller confirmation deadline, record full-refund decision as SettlementPending; funds and reservation remain held until internal refund worker posts. Separate from unpaid cancellation. */
        post: operations["cancelPaidOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/orders/{orderId}/reject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Seller only, including LOCKED existing obligations; before confirmation deadline request full refund as SettlementPending. No seller acceptance or automatic violation strike implemented. */
        post: operations["rejectPaidOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/orders/{orderId}/accept": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Verified MEMBER Seller only, including RESTRICTED/LOCKED existing obligations. Before fixed confirmation deadline, atomically accept funded Order into Preparing and set 48-hour pickup deadline. Buyer cancellation racing acceptance has one winner. No journal, reservation release or seller credit. Shipment registration and carrier evidence remain planned. */
        post: operations["acceptOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/orders/{orderId}/packaging-evidence": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Verified MEMBER Seller only. Creates a durable, private upload intent for an accepted Order (Preparing or ResolutionPending). No change to Order version, money, deadlines or commitment. Replay still requires current ownership/session. */
        post: operations["createPackagingEvidence"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/orders/{orderId}/packaging-evidence/{evidenceId}/content": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** @description Authenticated Seller binary PUT with Idempotency-Key. Exact declared length/hash/MIME; real decode, single-frame <=40MP, normalized <=1600px WebP preview. Original stays private. Shared two-upload process bound; storage I/O outside DB locks, permissions/session rechecked before acknowledgement. Same bytes/key recover a lost response without overwriting. Ready uploads can replay without storage. No upload ticket is needed beyond bearer authentication. */
        put: operations["uploadPackagingEvidence"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/orders/{orderId}/packaging-evidence": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Verified MEMBER participants, including LOCKED. Bounded list of retained intent metadata, no storage keys or signed URLs; Pending is not submitted evidence. */
        get: operations["listPackagingEvidence"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/orders/{orderId}/packaging-evidence/{evidenceId}/read": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Verified MEMBER participants only, including LOCKED. Ready normalized preview only; signed URL lasts 120 seconds. Check permission before and after signing and audit issuance by actor/context/evidence ID. Existing URLs remain valid until expiry. Originals and generic Staff/Admin access are not exposed. */
        get: operations["readPackagingEvidence"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/orders/{orderId}/shipment": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Verified MEMBER Seller, including LOCKED/RESTRICTED existing obligations. One outbound per DirectDelivery Order, while Preparing and before fixed pickup deadline. Pins 1-8 Ready packaging images from this Order and frozen agreement contacts/fee; client cannot override contacts, fees, direction or custody. Carrier is explicitly simulated, code canonical uppercase LL- plus 8-32 alphanumerics. Unique carrier/code globally. Idempotency replay checks current authorization but survives deadline/review. Does not change Order version, funds, commitment or confirm pickup. Tracking correction/replacement is not implemented. Independent pickup simulation is a separate operator endpoint. */
        post: operations["registerDirectShipment"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/orders/{orderId}/shipment": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Verified MEMBER participants including LOCKED. 404 for absent shipment or unrelated Order. Seller sees frozen origin and destination; Buyer only own destination (origin null). No generic operations-role access or public tracking link. Retained after pickup deadline review. LabelCreated and pickupConfirmed=false explicitly do not mean dispatch. */
        get: operations["getMyDirectShipment"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/operations/simulator/pickup-events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description ACTIVE verified independent TEST_OPERATOR only; cannot be either participant even with both roles. Idempotency-Key MUST equal eventId. Server signs a domain-separated envelope then verifies it through the carrier adapter. No public webhook. Global event ID dedupe across operators returns original receipt; same ID changed payload409. Explicit shipment/order/tracking match, occurredAt >= label registration and <= DB decision time. First timely accepted pickup moves Preparing to InTransit without money/stock movement; late or conflicting pickup records sticky carrier review/ResolutionPending. Same factual pickup under another event ID is Duplicate. Maximum128 retained events per shipment, replays still work. Delivery/returns/resolution remain planned. */
        post: operations["emitSimulatedPickupEvent"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/operations/simulator/delivery-events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Independent TEST_OPERATOR records one simulated Delivered event after an Applied pickup. It starts, but never settles, the buyer inspection window. */
        post: operations["emitSimulatedDeliveryEvent"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/orders/{orderId}/confirm-receipt": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Buyer-only receipt confirmation. It starts the 72-hour inspection window; it does not settle money or mark the listing Sold. */
        post: operations["confirmOrderReceipt"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/orders/{orderId}/shipment/pickup-events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Verified MEMBER participants including LOCKED only. Bounded chronological immutable pickup history; no signatures, operator IDs or contacts. Receipt replay is historical, not a current-state query. */
        get: operations["listMyPickupEvents"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/orders/{orderId}/non-receipt": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Verified MEMBER Buyer only, including LOCKED/RESTRICTED existing obligation. Expected current Order version 4 or 5 and Idempotency-Key required. At/after the immutable Applied pickup deliveryDeadline, opens one delivery review or attaches one immutable Buyer report to the existing review. InTransit4 becomes ResolutionPending5; an already ResolutionPending5 Order stays at version5. Before deadline or without Applied pickup returns409. Seller/outsiders404. Replays check current auth first. No money, refund, restock or custody conclusion. This is the overdue non-receipt intake, not a complete dispute/adjudication workflow; Delivered and denial of delivered remain planned. */
        post: operations["reportOrderNonReceipt"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/handover-points": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Authenticated MEMBER/STAFF/ADMIN. The two simulated HCM demo points with remaining capacity; not real business locations. */
        get: operations["listHandoverPoints"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auction-intakes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Seller ACTIVE verified MEMBER. Approved, Visible, Available Sale listing with current revision; Exchange/Both rejected. In one transaction snapshots revision/start/step/buyNow, takes the exclusive commitment and one point slot (capacity checked under the point lock). Self drop-off within 72 hours; at most two unfinished intakes/auctions per seller (POL-41). */
        post: operations["createAuctionIntake"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/auction-intakes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Seller view of own intakes, newest first (max 50). Shelf code and Staff identities are not exposed. */
        get: operations["listMyAuctionIntakes"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/auction-intakes/{intakeId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Owner only; others receive 404. */
        get: operations["getMyAuctionIntake"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auction-intakes/{intakeId}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Owner. Before drop-off releases commitment and slot; after receipt and before the auction opens moves to ReclaimRequired. An opened auction can be withdrawn only while it is Active, before endAt and before the first bid (auction Cancelled, book to reclaim). After the first bid only an independent Admin can cancel. */
        post: operations["cancelAuctionIntake"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/operations/auction-intakes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description ACTIVE STAFF with a current assignment. Intakes at the assigned points that need receipt, inspection, opening or reclaim. */
        get: operations["listPointAuctionIntakes"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/operations/auction-intakes/{intakeId}/receive": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Assigned STAFF independent of the seller records the physical self drop-off before the deadline with a private shelf code. */
        post: operations["receiveAuctionIntake"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/operations/auction-intakes/{intakeId}/inspect": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Assigned independent STAFF records condition inspection Pass or Fail against the frozen revision. Fail moves to ReclaimRequired. Pass is a condition checklist, not authenticity. */
        post: operations["inspectAuctionIntake"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/operations/auction-intakes/{intakeId}/open": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Assigned independent STAFF opens a Passed intake while the seller is still ACTIVE: startAt is server time, endAt is 24 hours later, no scheduling or extension. */
        post: operations["openAuction"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/operations/auction-intakes/{intakeId}/reclaim": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Assigned independent STAFF records that the seller collected the book. Releases the slot and exclusive commitment; the listing returns to Available. */
        post: operations["reclaimAuctionIntake"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/operations/auctions/{auctionId}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description ACTIVE ADMIN independent of seller and bidders cancels an Active or OnHold auction with a reason; never selects a winner. The book moves to reclaim. */
        post: operations["cancelAuction"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auctions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Public. Active auctions ending soonest first (max 50). Shows price and anonymous bidder count; ceilings are never exposed. */
        get: operations["listAuctions"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/auctions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Member-only keyset page of their own seller, bidder or Buy Now winner auctions. Cursor is bound to actor and view. Never returns another bidder's commitment ceiling. */
        get: operations["listMyAuctions"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auctions/{auctionId}/photos/{mediaId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Public signed derivative from the inspected, approved intake revision only. Rechecks publication and media eligibility before and after signing. No storage keys or staff notes are exposed. */
        get: operations["getAuctionPhoto"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auctions/{auctionId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Public. Price, end time, anonymous price history and minimum next bid. Seller and guests never see ceilings. */
        get: operations["getAuction"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/auctions/{auctionId}/participation": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description The calling bidder or Buy Now buyer only: own commitment level (including own Auto ceiling), leading flag and outcome. Others receive 404. */
        get: operations["getMyAuctionParticipation"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auctions/{auctionId}/bids": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description ACTIVE verified MEMBER other than the seller or the Staff handling the book. Amount must be on the start + n*step grid, at least the minimum bid and at most 1,000,000. The leader cannot bid manually. Rejected at or after endAt even if the close worker has not run. No money is held at bid time. */
        post: operations["placeAuctionBid"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auctions/{auctionId}/auto-bid": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** @description Sets or raises a private Auto ceiling on the price grid. A new ceiling must reach the minimum bid; the leader may only raise, which never raises the price. */
        put: operations["setAuctionAutoBid"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auctions/{auctionId}/auto-bid/disable": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Stops further automatic raises. A leading bidder stays committed at the current price; it never lowers the price or revives an outbid bidder. */
        post: operations["disableAuctionAutoBid"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/point-orders/{orderId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Buyer or seller of a ViaPoint Order formed by an auction; others receive 404. Shows frozen amounts and deadlines; the identity of the other party and the point shelf code are not exposed. */
        get: operations["getMyPointOrder"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/point-orders/{orderId}/pay": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Buyer ACTIVE/RESTRICTED; LOCKED denied. Before the payment deadline (endAt + 24h, or 15 minutes for Buy Now) moves the frozen buyerTotal from available to the Order hold atomically and marks the auction Sold; the Order becomes Fulfilling without seller confirmation (FR-O05). A racing deadline expiry has exactly one outcome. Partial payment is never accepted. */
        post: operations["payPointOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/point-orders/{orderId}/accept-report": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Buyer only, within 72 hours of payment (POL-32). Accepts the condition report of the paid ViaPoint Order and opens a 72-hour collection window ending within point hours (POL-33). Accepting never waives a later claim (FR-T03). */
        post: operations["acceptPointOrderReport"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/point-orders/{orderId}/reject-report": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Buyer only, before accepting. Opens ResolutionPending with the reason; the book stays at the point and the payment stays held until an independent Admin refunds it or reopens collection. */
        post: operations["rejectPointOrderReport"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/point-orders/{orderId}/claim": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Buyer only, in Inspection before the inspection deadline (a LOCKED account may still claim). Opens ResolutionPending (InspectionClaim) with the description and stops settlement; the payment stays held until an independent Admin decides. After a dismissal the buyer may claim again within the window; that claim must be decided by a different Admin. */
        post: operations["claimPointOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/point-orders/{orderId}/collection-code": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Buyer only, after accepting and before the collection deadline. Issues a 6-digit code valid for 10 minutes bound to recipient, book and point; a new code revokes the previous one. Only a salted hash is stored and the code is returned once. */
        post: operations["requestCollectionCode"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/operations/point-orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description ACTIVE STAFF with a current point assignment: paid Orders at assigned points awaiting the recipient, oldest deadline first. */
        get: operations["listPointCollections"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/operations/point-orders/{orderId}/handover": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Assigned STAFF independent of buyer and seller, during point hours (09:00-18:00 Asia/Ho_Chi_Minh). A correct live code records one handover and starts the 72-hour inspection window. Wrong or expired codes are recorded and refused; the sixth wrong attempt within 15 minutes is rate limited (AC-H17). */
        post: operations["handOverPointOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/operations/point-orders/{orderId}/receive-return": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description ACTIVE STAFF assigned to the point, not buyer or seller, during point hours and before the return deadline. MatchesReport records the book back at the point, posts one OrderRefund journal of the full hold to the buyer, cancels the Order and sends the book to the seller reclaim with its listing back to revision (OrderReturned). DoesNotMatch refuses the item: the attempt is recorded, nothing changes hands, no refund, and the return deadline keeps running. */
        post: operations["receivePointOrderReturn"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/operations/point-order-resolutions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description ACTIVE ADMIN. ViaPoint Orders in ResolutionPending, oldest first, excluding Orders the Admin takes part in or handles at the point. */
        get: operations["listPointOrderResolutions"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/operations/point-orders/{orderId}/resolve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description ACTIVE ADMIN independent of buyer, seller and the Staff who received, inspected, handed over, took back or work at the point; a repeated claim needs an Admin who did not decide an earlier claim. Only for ResolutionPending. RecipientDecisionOverdue: RefundBuyer (BuyerDefault or NoFault). ReportRejected: RefundBuyer (BookMisdescribed or NoFault) or ResumeCollection when the rejection is unfounded. CollectionOverdue: RefundBuyer (BuyerDefault or NoFault) or ResumeCollection. RefundBuyer posts one OrderRefund of the full hold, cancels the Order and sends the book to reclaim (BookMisdescribed also sends the listing back to revision; BuyerDefault records a violation). ResumeCollection opens a new 72-hour window in point hours without recording a buyer acceptance. After the handover (InspectionClaim, ReturnOverdue): DismissClaim back to Inspection, or RequireReturn within 72 hours. Any other decision or fault returns 422. A reason is required and recorded. */
        post: operations["resolvePointOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auctions/{auctionId}/buy-now": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Only before the first valid bid; decided under the same auction lock as bids so exactly one wins. Forms a ViaPoint Order at the Buy Now price with a 15-minute payment deadline and moves the exclusive commitment to it without release. */
        post: operations["buyAuctionNow"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/exchanges": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Returns a list of exchanges for the current user. */
        get: operations["listExchanges"];
        put?: never;
        /** @description Initiates an exchange proposal between the user's listing and another user's listing. */
        post: operations["createExchangeProposal"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/exchanges/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Returns details of a specific exchange. */
        get: operations["getExchange"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/exchanges/{id}/accept": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Recipient accepts the exchange proposal. */
        post: operations["acceptExchange"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/exchanges/{id}/funding": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Participant funds their part of the exchange (deposit + diff). */
        post: operations["fundExchange"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/exchanges/{id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Initiator cancels the exchange proposal. */
        post: operations["cancelExchange"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/exchanges/{id}/reject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Recipient rejects the exchange proposal. */
        post: operations["rejectExchange"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/exchanges/{id}/ship": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Participant confirms they have shipped their book. */
        post: operations["shipExchange"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/exchanges/{id}/receive": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Participant confirms they have received the other book. */
        post: operations["receiveExchange"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        HealthResponse: {
            /** @constant */
            status: "ok";
            /** @constant */
            service: "used-book-api";
            /** Format: date-time */
            timestamp: string;
        };
        AccountEmailRequest: {
            /** Format: email */
            email: string;
        };
        RegisterRequest: {
            /** Format: email */
            email: string;
            password: string;
            displayName: string;
            /** @constant */
            acceptedRules: true;
        };
        AuthActionTokenRequest: {
            token: string;
        };
        ResetPasswordRequest: {
            token: string;
            password: string;
        };
        AccountRequestAcknowledgement: {
            message: string;
        };
        AccountOtpRequest: {
            /** Format: email */
            email: string;
            /** @enum {string} */
            purpose: "VerifyEmail" | "ResetPassword";
        };
        AccountOtpCodeRequest: {
            /** Format: uuid */
            challengeId: string;
            code: string;
        };
        AccountOtpResetRequest: {
            /** Format: uuid */
            challengeId: string;
            code: string;
            password: string;
        };
        AccountOtpAcknowledgement: {
            message: string;
            /** Format: uuid */
            challengeId: string;
            /** @constant */
            expiresIn: 300;
            /** @constant */
            resendAfter: 60;
        };
        LoginRequest: {
            /** Format: email */
            email: string;
            password: string;
        };
        RefreshRequest: {
            refreshToken: string;
        };
        /** @description Current verified account state from the database, never JWT role/status claims. LOCKED can authenticate but is limited to explicit existing-obligation endpoints. DISABLED/unverified cannot authenticate. Roles and ownership checks still apply; 403 does not invalidate the session. */
        CurrentUser: {
            /** Format: uuid */
            id: string;
            /** Format: email */
            email: string;
            displayName: string;
            /** @enum {string} */
            status: "ACTIVE" | "RESTRICTED" | "LOCKED";
            roles: ("MEMBER" | "STAFF" | "ADMIN" | "TEST_OPERATOR")[];
        };
        /** @enum {string} */
        ManagedUserStatus: "PENDING_VERIFICATION" | "ACTIVE" | "RESTRICTED" | "LOCKED" | "DISABLED";
        /** @enum {string} */
        RoleCode: "MEMBER" | "STAFF" | "ADMIN" | "TEST_OPERATOR";
        /** @description Private operational directory entry. Returned only to an ACTIVE ADMIN; it contains no credentials, session information, addresses, wallet data or transaction history. */
        OperationsUser: {
            /** Format: uuid */
            id: string;
            /** Format: email */
            email: string;
            displayName: string;
            status: components["schemas"]["ManagedUserStatus"];
            emailVerifiedAt: string | null;
            roles: components["schemas"]["RoleCode"][];
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        OperationsUserPage: {
            items: components["schemas"]["OperationsUser"][];
            nextCursor: string | null;
            /** Format: date-time */
            serverTime: string;
        };
        AuthTokens: {
            accessToken: string;
            refreshToken: string;
            /** @constant */
            expiresIn: 900;
            user: components["schemas"]["CurrentUser"];
        };
        ApiError: {
            statusCode: number;
            code: string;
            message: string;
            /** Format: uuid */
            requestId: string;
            fieldErrors?: components["schemas"]["FieldError"][];
            retryAfterSeconds?: number;
        };
        /** @enum {string} */
        ListingMode: "Sale" | "Exchange" | "Both";
        /** @enum {string} */
        BookCondition: "LikeNew" | "Good" | "Fair" | "Worn";
        /** @enum {string} */
        ModerationStatus: "Draft" | "PendingReview" | "Approved" | "Rejected";
        /** @enum {string} */
        VisibilityStatus: "Visible" | "Hidden" | "Removed";
        /** @enum {string} */
        TradeStatus: "Available" | "Reserved" | "Sold" | "Exchanged" | "ClosedUnavailable";
        /** @enum {string} */
        CatalogStatus: "Pending" | "Confirmed" | "Rejected";
        /** @enum {string} */
        MediaStatus: "Pending" | "Processing" | "Ready" | "Failed";
        CatalogOption: {
            id: string;
            label: string;
        };
        CatalogFacet: {
            id: string;
            label: string;
            options: components["schemas"]["CatalogOption"][];
        };
        CatalogCategory: {
            id: string;
            label: string;
            parentId: string | null;
            facets: string[];
        };
        /** @enum {string} */
        CatalogCategoryId: "manga" | "light-novel" | "literature" | "languages" | "languages.en" | "languages.ja" | "languages.ko" | "languages.zh" | "languages.other" | "languages.fr" | "languages.de" | "languages.vi" | "education" | "business" | "business.management" | "business.marketing" | "business.finance" | "business.startup" | "business.economics" | "business.accounting" | "business.hr" | "business.supply-chain" | "business.lessons" | "psychology" | "psychology.psychology" | "psychology.skills" | "psychology.teen" | "children" | "science" | "science.natural" | "science.technology" | "science.space" | "science.environment" | "history" | "history.history" | "history.geography" | "biography" | "biography.politics" | "biography.business" | "biography.science" | "biography.arts" | "biography.life" | "parenting" | "parenting.care" | "parenting.education" | "parenting.development" | "parenting.family" | "health" | "health.medicine" | "health.nutrition" | "health.wellness" | "health.fitness" | "arts" | "arts.visual" | "arts.design" | "arts.photography" | "arts.music" | "arts.cinema" | "arts.architecture" | "society" | "society.philosophy" | "society.law" | "society.politics" | "society.sociology" | "society.religion" | "lifestyle" | "lifestyle.cooking" | "lifestyle.crafts" | "lifestyle.gardening" | "lifestyle.travel" | "lifestyle.sports" | "other";
        CatalogAttributes: {
            genre?: ("action" | "adventure" | "fantasy" | "romance" | "comedy" | "drama" | "mystery" | "horror" | "scifi" | "historical" | "sports" | "psychological" | "tragedy" | "suspense")[];
            audience?: ("shounen" | "shoujo" | "seinen" | "josei" | "kodomo")[];
            setting?: ("school" | "isekai" | "daily" | "apocalypse" | "supernatural" | "gaming" | "mecha" | "workplace")[];
            form?: ("novel" | "short" | "essay" | "poetry" | "memoir" | "picture" | "activity" | "story" | "reportage" | "travelogue" | "criticism" | "biography" | "autobiography")[];
            purpose?: ("general" | "communication" | "exam" | "textbook" | "workbook" | "reference" | "dictionary")[];
            level?: ("beginner" | "intermediate" | "advanced" | "n5" | "n4" | "n3" | "n2" | "n1" | "ielts" | "toeic" | "hsk" | "topik" | "delf" | "goethe")[];
            skill?: ("listening" | "speaking" | "reading" | "writing" | "grammar" | "vocabulary" | "characters" | "pronunciation")[];
            schoolStage?: ("primary" | "secondary" | "high" | "university" | "preschool")[];
            grade?: ("1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "11" | "12")[];
            subject?: ("math" | "literature" | "english" | "physics" | "chemistry" | "biology" | "history" | "geography" | "computing" | "civics" | "arts" | "music" | "technology")[];
            reader?: ("student" | "professional" | "manager" | "entrepreneur" | "parent" | "teen" | "general")[];
            topic?: ("habits" | "communication" | "emotion" | "relationships" | "career" | "animals" | "nature" | "discovery" | "culture" | "politics" | "civilization" | "time-management" | "thinking" | "safety" | "life-skills" | "maps" | "landscapes" | "business-life" | "scientist" | "artist" | "personal-life" | "infant-care" | "education-methods" | "child-development" | "family-life" | "medical-study" | "nutrition" | "wellbeing" | "exercise" | "public-health" | "art-history" | "drawing" | "graphic-design" | "photography" | "music-theory" | "filmmaking" | "architecture" | "philosophy" | "ethics" | "society" | "religion" | "law" | "cooking" | "crafts" | "gardening" | "travel" | "sports")[];
            age?: ("0-3" | "4-6" | "7-10" | "11-15" | "16-18")[];
            depth?: ("intro" | "popular" | "specialist")[];
            region?: ("vietnam" | "asia" | "europe" | "americas" | "world")[];
            period?: ("ancient" | "medieval" | "modern" | "contemporary")[];
            comicStyle?: ("manga" | "manhwa" | "manhua" | "comic")[];
            workOrigin?: ("vietnam" | "foreign")[];
            businessTopic?: ("leadership" | "strategy" | "digital-marketing" | "branding" | "sales" | "investing" | "personal-finance" | "banking" | "startup" | "innovation" | "microeconomics" | "macroeconomics" | "accounting" | "tax" | "audit" | "recruitment" | "people-management" | "logistics" | "operations" | "business-cases")[];
            scienceField?: ("math" | "physics" | "chemistry" | "biology" | "earth" | "astronomy" | "environment" | "engineering" | "computing")[];
            technologyTopic?: ("programming" | "web" | "data" | "ai" | "hardware" | "networks" | "security")[];
            artMedium?: ("pencil" | "watercolor" | "oil" | "digital" | "film" | "instrument")[];
            lawField?: ("civil" | "criminal" | "business" | "labor" | "constitutional" | "international")[];
            cuisine?: ("vietnam" | "asian" | "western" | "vegetarian" | "baking")[];
            craftType?: ("sewing" | "knitting" | "paper" | "wood" | "ceramics")[];
        };
        /** @description Trim text and count Unicode code points. ISBN may be null. Input normalization accepts ISBN separators/case and converts valid ISBN-10 to ISBN-13 before schema validation and hashing. ISBN-13 requires prefix 978 or 979 and a valid checksum; this does not verify assignment to a title. Metadata is immutable after confirmation. language is a BCP-47 tag canonicalized with Intl.getCanonicalLocales; malformed tags return field validation errors. */
        CatalogMetadata: {
            /** @description Stable taxonomy code. Optional for legacy clients; when supplied category must match its canonical label. Confirmed metadata stays immutable. */
            categoryId?: components["schemas"]["CatalogCategoryId"] | null;
            attributes?: components["schemas"]["CatalogAttributes"];
            /** @description Series name as supplied and reviewed; not the volume or completion status. */
            series?: string | null;
            title: string;
            authors: string[];
            publisher: string | null;
            publicationYear: number | null;
            language: string;
            edition: string | null;
            category: string;
            isbn: string | null;
        };
        PublicBook: {
            /** @description Stable taxonomy code. Optional for legacy clients; when supplied category must match its canonical label. Confirmed metadata stays immutable. */
            categoryId?: components["schemas"]["CatalogCategoryId"] | null;
            attributes?: components["schemas"]["CatalogAttributes"];
            /** @description Series name as supplied and reviewed; not the volume or completion status. */
            series?: string | null;
            /** Format: uuid */
            id: string;
            title: string;
            authors: string[];
            publisher: string | null;
            publicationYear: number | null;
            language: string;
            edition: string | null;
            category: string;
            isbn: string | null;
        };
        CatalogRequestRevision: {
            /** Format: uuid */
            id: string;
            number: number;
            metadata: components["schemas"]["CatalogMetadata"];
            /** Format: date-time */
            submittedAt: string;
        };
        CatalogDecision: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            revisionId: string;
            /** @enum {string} */
            decision: "Confirm" | "Reject";
            reason: string | null;
            /** Format: date-time */
            decidedAt: string;
        };
        PrivateCatalogRequest: {
            /** Format: uuid */
            id: string;
            version: number;
            status: components["schemas"]["CatalogStatus"];
            /** Format: uuid */
            requesterId: string;
            currentRevision: components["schemas"]["CatalogRequestRevision"];
            decisions: components["schemas"]["CatalogDecision"][];
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        /** @description Full replacement, not a patch. Incomplete text is allowed. Selected values must be valid; inactive mode prices must be null (both null if mode is null). mediaIds are ordered and must belong to this listing. Uploads may be Processing in a draft, but must be Ready at submission. */
        DraftContent: {
            bookId: string | null;
            mode: components["schemas"]["ListingMode"] | null;
            condition: components["schemas"]["BookCondition"] | null;
            pages: string;
            coverNote: string;
            notes: string;
            accessories: string;
            readable: boolean | null;
            hasMissingPages: boolean | null;
            missingEssentialContent: boolean | null;
            description: string;
            salePrice: number | null;
            exchangeValue: number | null;
            mediaIds: string[];
            /** @description Optional while a draft is incomplete; required before submitting a Sale or Both listing. Omitted preserves the existing choice on replacement; null explicitly clears it. Configured origins must be current at save, submission and approval. No checkout is enabled. */
            fulfillment?: components["schemas"]["ListingFulfillment"] | null;
        } & ({
            /** @constant */
            mode?: "Sale";
            exchangeValue?: null;
        } | {
            /** @constant */
            mode?: "Exchange";
            salePrice?: null;
        } | {
            /** @constant */
            mode?: "Both";
        } | {
            mode?: null;
            salePrice?: null;
            exchangeValue?: null;
        });
        /** @description All text trimmed before validation. At submit the server validates the saved draft against this schema, ownership declaration, Ready media and accessible catalog. A Pending catalog may wait in the queue; approval requires Confirmed. */
        SubmittedContent: {
            /** Format: uuid */
            bookId: string;
            mode: components["schemas"]["ListingMode"];
            condition: components["schemas"]["BookCondition"];
            pages: string;
            coverNote: string;
            notes: string;
            accessories: string;
            /** @constant */
            readable: true;
            hasMissingPages: boolean;
            /** @constant */
            missingEssentialContent: false;
            description: string;
            salePrice: number | null;
            exchangeValue: number | null;
            mediaIds: string[];
            /** @description Optional for legacy compatibility. Omitted preserves the existing choice on replacement; null explicitly clears it. Configured origins must be current at save, submission and approval. No checkout is enabled. */
            fulfillment?: components["schemas"]["ListingFulfillment"] | null;
        } & ({
            /** @constant */
            mode?: "Sale";
            salePrice?: number;
            exchangeValue?: null;
        } | {
            /** @constant */
            mode?: "Exchange";
            salePrice?: null;
            exchangeValue?: number;
        } | {
            /** @constant */
            mode?: "Both";
            salePrice?: number;
            exchangeValue?: number;
        });
        ListingState: {
            moderation: components["schemas"]["ModerationStatus"];
            visibility: components["schemas"]["VisibilityStatus"];
            trade: components["schemas"]["TradeStatus"];
            deletedAt: string | null;
        };
        ListingRevision: {
            /** Format: uuid */
            id: string;
            number: number;
            content: components["schemas"]["DraftContent"];
            submittedAt: string | null;
            ownershipDeclaredAt: string | null;
            decision: components["schemas"]["ReviewDecision"] | null;
            /**
             * @description Current means the saved origin reference still matches; it is not transaction eligibility.
             * @enum {string}
             */
            fulfillmentStatus: "NotConfigured" | "Current" | "NeedsUpdate";
        };
        ReviewDecision: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            revisionId: string;
            /** @enum {string} */
            decision: "Approve" | "Reject";
            reason: string | null;
            /** Format: date-time */
            decidedAt: string;
        };
        PrivateListing: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            ownerId: string;
            version: number;
            state: components["schemas"]["ListingState"];
            currentRevision: components["schemas"]["ListingRevision"];
            latestDecision: components["schemas"]["ReviewDecision"] | null;
            /** @description Present only on the Staff/Admin review detail. The price suggestion the seller decided on with the revision under review (null when none), so the reviewer can tell a suggested price from the seller's own. */
            priceAssist?: components["schemas"]["PriceAssistReview"] | null;
            removalReason: string | null;
            catalogStatus: components["schemas"]["CatalogStatus"] | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        /** @description A signed URL to an orientation-corrected, location-metadata-stripped derivative. At most 600 seconds. Never expose original object keys. Existing signed URLs can remain usable until expiry after removal. */
        MediaRead: {
            /** Format: uuid */
            id: string;
            /** Format: uri */
            url: string;
            /** Format: date-time */
            expiresAt: string;
            width: number;
            height: number;
        };
        /** @description Only current Approved + Visible + Available/Reserved + nondeleted listings whose verified ACTIVE owner has MEMBER role, Confirmed catalog and Ready media. A Reserved listing remains readable only while it has an active 24-hour purchase conversation, but it cannot start another conversation. Never serialize a private listing then filter on the client. */
        PublicListing: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            revisionId: string;
            version: number;
            book: components["schemas"]["PublicBook"];
            mode: components["schemas"]["ListingMode"];
            condition: components["schemas"]["BookCondition"];
            pages: string;
            coverNote: string;
            notes: string;
            accessories: string;
            /** @constant */
            readable: true;
            hasMissingPages: boolean;
            /** @constant */
            missingEssentialContent: false;
            description: string;
            salePrice: number | null;
            exchangeValue: number | null;
            seller: {
                /** Format: uuid */
                id: string;
                displayName: string;
            };
            photos: components["schemas"]["PublicListingPhoto"][];
            /** Format: date-time */
            publishedAt: string;
            /** @description Null when not configured or the origin was changed/deleted. The listing remains readable. */
            fulfillment: components["schemas"]["PublicFulfillment"] | null;
            purchaseAvailability: {
                /** @enum {string} */
                status: "Available" | "InNegotiation";
                expiresAt: string | null;
            };
        } & ({
            /** @constant */
            mode?: "Sale";
            salePrice?: number;
            exchangeValue?: null;
        } | {
            /** @constant */
            mode?: "Exchange";
            salePrice?: null;
            exchangeValue?: number;
        } | {
            /** @constant */
            mode?: "Both";
            salePrice?: number;
            exchangeValue?: number;
        });
        CreatePurchaseConversation: {
            expectedVersion: number;
        };
        PurchaseConversationReceipt: {
            /** Format: uuid */
            id: string;
            /** @constant */
            entityType: "PurchaseConversation";
            /** Format: uuid */
            entityId: string;
            /** Format: uuid */
            listingId: string;
            version: number;
            /** @enum {string} */
            status: "Active" | "Expired" | "Cancelled";
            /** Format: date-time */
            expiresAt: string;
            /** Format: date-time */
            serverTime: string;
        };
        PurchaseParticipant: {
            /** Format: uuid */
            id: string;
            displayName: string;
        };
        MemberNotification: {
            /** Format: uuid */
            id: string;
            /** @enum {string} */
            kind: "AuctionOutbid" | "AuctionWon" | "AuctionSold" | "AuctionBoughtNow" | "AuctionUnsold" | "AuctionCancelled" | "AuctionOnHold" | "AuctionPaymentExpired" | "AuctionPaid";
            title: string;
            body: string;
            /** @enum {string} */
            targetType: "Auction";
            /**
             * Format: uuid
             * @description Opens with GET /auctions/{id}; the caller's own view comes from participation or point-order reads.
             */
            targetId: string;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            readAt: string | null;
        };
        MemberNotificationPage: {
            items: components["schemas"]["MemberNotification"][];
            unreadCount: number;
            nextCursor: string | null;
        };
        /** @description Exactly one of ids or all. */
        MarkNotificationsRead: {
            ids?: string[];
            /** @constant */
            all?: true;
        };
        NotificationUnreadCount: {
            unreadCount: number;
        };
        PurchaseConversation: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            listingId: string;
            buyer: components["schemas"]["PurchaseParticipant"];
            seller: components["schemas"]["PurchaseParticipant"];
            version: number;
            /** @enum {string} */
            status: "Active" | "Expired" | "Cancelled";
            /** Format: date-time */
            expiresAt: string;
            /** Format: date-time */
            createdAt: string;
            closedAt: string | null;
        };
        PurchaseMessage: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            conversationId: string;
            /** Format: uuid */
            senderId: string;
            body: string;
            /** Format: date-time */
            sentAt: string;
        };
        ListingMedia: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            listingId: string;
            status: components["schemas"]["MediaStatus"];
            version: number;
            /** @enum {string} */
            mimeType: "image/jpeg" | "image/png" | "image/webp";
            byteSize: number;
            failureCode: ("InvalidImage" | "UnsupportedFormat" | "TooLarge" | "TooManyPixels" | "MultipleFrames" | "ProcessingFailed" | "UploadExpired") | null;
            /** Format: date-time */
            createdAt: string;
        };
        /** @description Receipt of the committed command, not necessarily current entity state. Exact replay returns the original receipt and Idempotency-Replayed: true. Authenticate/authorize receipt access first, then check key/payload BEFORE expectedVersion. Refetch entity after replay. Retained for the entire demo lifetime; no TTL cleanup yet. */
        MutationReceipt: {
            /** Format: uuid */
            id: string;
            /** @enum {string} */
            entityType: "Listing" | "Catalog" | "Media";
            /** Format: uuid */
            entityId: string;
            version: number;
            revisionId: string | null;
            state: (components["schemas"]["ListingState"] | components["schemas"]["CatalogStatus"] | components["schemas"]["MediaStatus"]) | null;
            /** Format: date-time */
            serverTime: string;
        };
        VersionCommand: {
            expectedVersion: number;
        };
        /** @description Create the server draft before requesting uploads. mediaIds must be empty at creation because assets are bound to an existing listing ID. SaveDraft attaches uploaded media later. */
        CreateDraft: {
            content: components["schemas"]["DraftContent"] & {
                mediaIds?: unknown[];
            };
        };
        SaveDraft: {
            expectedVersion: number;
            content: components["schemas"]["DraftContent"];
            priceAssist?: components["schemas"]["PriceAssistDecision"];
        };
        SubmitListing: {
            expectedVersion: number;
            /** @constant */
            ownershipDeclared: true;
        };
        EditApproved: {
            expectedVersion: number;
            content: components["schemas"]["SubmittedContent"];
            /** @constant */
            ownershipDeclared: true;
            priceAssist?: components["schemas"]["PriceAssistDecision"];
        };
        /** @description Optional record of the seller's decision about a price suggestion for this listing. Stored with the suggestion in the same transaction as the save; the listing price stays the seller's salePrice. Rejected with 422 at /priceAssist/suggestionId when the suggestion is unknown, foreign, not Suggested, expired, or was made for another book, condition or condition answers than the content being saved. */
        PriceAssistDecision: {
            /** Format: uuid */
            suggestionId: string;
            /** @description true when the seller used the suggested range; false when they priced manually. */
            applied: boolean;
        };
        PriceAssistReview: {
            /** Format: uuid */
            suggestionId: string;
            range: {
                low: number;
                high: number;
            };
            evidenceLevel: components["schemas"]["PriceEvidenceLevel"];
            model: string | null;
            /** @description What the seller declared when the suggestion was made. */
            input: {
                condition: components["schemas"]["BookCondition"] | null;
                readable: boolean | null;
                hasMissingPages: boolean | null;
                missingEssentialContent: boolean | null;
            };
            applied: boolean;
            chosenSalePrice: number | null;
            withinRange: boolean | null;
            /** Format: date-time */
            decidedAt: string;
            sources: components["schemas"]["PriceSource"][];
        };
        PriceSuggestionRequest: {
            /** Format: uuid */
            bookId: string;
            condition: components["schemas"]["BookCondition"] | null;
            readable: boolean | null;
            hasMissingPages: boolean | null;
            missingEssentialContent: boolean | null;
            /** @description Optional condition text. Treated as data; contact-like text is removed before any provider call. */
            conditionNote?: string;
        };
        /** @enum {string} */
        PriceSuggestionStatus: "Suggested" | "NeedsMoreData" | "Refused";
        /** @enum {string} */
        PriceEvidenceLevel: "Strong" | "Limited" | "Insufficient";
        /**
         * @description OnlineRetail is a new-book price read from an allowed shop's product page by the online lookup (URL and date kept); CoverPrice and EditorialReference are staff-entered.
         * @enum {string}
         */
        PriceSourceKind: "CoverPrice" | "EditorialReference" | "InternalAsking" | "CompletedSale" | "OnlineRetail";
        PriceSource: {
            ref: string;
            kind: components["schemas"]["PriceSourceKind"];
            label: string;
            amount: number;
            condition: components["schemas"]["BookCondition"] | null;
            /** Format: date-time */
            observedAt: string;
            url: string | null;
            /** @description Why this source was shown but not used; null when used. AskingPrice marks other sellers' asking prices, which are shown for reference but never set the range. */
            excluded: ("Outlier" | "Stale" | "OtherEdition" | "AskingPrice") | null;
        };
        PriceFactor: {
            text: string;
            sourceRefs: string[];
        };
        PriceSuggestion: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            listingId: string;
            /** Format: uuid */
            bookId: string;
            /** @description Hash of book/condition inputs and the reference set. Clients drop a response whose listingId or fingerprint no longer matches the form. */
            inputFingerprint: string;
            status: components["schemas"]["PriceSuggestionStatus"];
            evidenceLevel: components["schemas"]["PriceEvidenceLevel"];
            /** @description Fixed rule ids that decided the evidence level or refusal. */
            rules: string[];
            range: {
                low: number;
                high: number;
            } | null;
            factors: components["schemas"]["PriceFactor"][];
            sources: components["schemas"]["PriceSource"][];
            missing: string[];
            dataAsOf: string | null;
            /** Format: date-time */
            generatedAt: string;
            /** Format: date-time */
            expiresAt: string;
            /** @description Provider model id when a model drafted the range; null for rule-only answers. */
            model: string | null;
            cached: boolean;
        };
        SetVisibility: {
            expectedVersion: number;
            /** @enum {string} */
            visibility: "Visible" | "Hidden";
        };
        RemoveListing: {
            expectedVersion: number;
            reason: string;
        };
        ReviewChecklist: {
            /** @constant */
            catalogMatches: true;
            /** @constant */
            photosClear: true;
            /** @constant */
            conditionDisclosed: true;
            /** @constant */
            readable: true;
            /** @constant */
            pricingValid: true;
            /** @constant */
            contentAppropriate: true;
        };
        DecideListing: {
            expectedVersion: number;
            /** Format: uuid */
            revisionId: string;
            /** @constant */
            decision: "Approve";
            checklist: components["schemas"]["ReviewChecklist"];
        } | {
            expectedVersion: number;
            /** Format: uuid */
            revisionId: string;
            /** @constant */
            decision: "Reject";
            reason: string;
        };
        CreateCatalogRequest: {
            metadata: components["schemas"]["CatalogMetadata"];
        };
        ResubmitCatalogRequest: {
            expectedVersion: number;
            metadata: components["schemas"]["CatalogMetadata"];
        };
        DecideCatalog: {
            expectedVersion: number;
            /** Format: uuid */
            revisionId: string;
            /** @constant */
            decision: "Confirm";
        } | {
            expectedVersion: number;
            /** Format: uuid */
            revisionId: string;
            /** @constant */
            decision: "Reject";
            reason: string;
        };
        CreateUpload: {
            expectedVersion: number;
            /** @enum {string} */
            mimeType: "image/jpeg" | "image/png" | "image/webp";
            byteSize: number;
            sha256: string;
        };
        /** @description API-relative upload destination, never an arbitrary remote URL. Session bearer auth is still required. Binary bytes are streamed to the API, checked and stored create-only. Client keys remain in memory; no storage credential is returned. */
        UploadTicket: {
            /** Format: uuid */
            mediaId: string;
            /** @constant */
            method: "PUT";
            path: string;
            headers: {
                [key: string]: string;
            };
            /** Format: date-time */
            expiresAt: string;
            /** @constant */
            maxBytes: 10000000;
        };
        /** @description JSON Pointer to request field, e.g. /content/description or /content/mediaIds/0. Client uses path/code, not parsing message. Message is safe display copy. */
        FieldError: {
            path: string;
            /** @enum {string} */
            code: "Required" | "Invalid" | "OutOfRange" | "TooLong" | "Unavailable" | "NotReady";
            message: string;
        };
        BookPage: {
            items: components["schemas"]["PublicBook"][];
            nextCursor: string | null;
            /** Format: date-time */
            serverTime: string;
        };
        PublicListingPage: {
            items: components["schemas"]["PublicListing"][];
            nextCursor: string | null;
            /** Format: date-time */
            serverTime: string;
        };
        PrivateListingPage: {
            items: components["schemas"]["PrivateListing"][];
            nextCursor: string | null;
            /** Format: date-time */
            serverTime: string;
        };
        CatalogRequestPage: {
            items: components["schemas"]["PrivateCatalogRequest"][];
            nextCursor: string | null;
            /** Format: date-time */
            serverTime: string;
        };
        ListingRevisionPage: {
            items: components["schemas"]["ListingRevision"][];
            nextCursor: string | null;
            /** Format: date-time */
            serverTime: string;
        };
        ListingMediaPage: {
            items: components["schemas"]["ListingMedia"][];
            nextCursor: string | null;
            /** Format: date-time */
            serverTime: string;
        };
        /** @enum {string} */
        ListingErrorCode: "VALIDATION_ERROR" | "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "RATE_LIMITED" | "UNAVAILABLE" | "INTERNAL_ERROR" | "AccountIneligible" | "SelfReviewForbidden" | "CatalogDuplicate" | "CatalogNotConfirmed" | "ListingInvalid" | "VersionConflict" | "InvalidState" | "IdempotencyConflict" | "MediaNotReady" | "MediaQuotaExceeded" | "UploadIncomplete" | "UploadExpired" | "PayloadTooLarge" | "UnsupportedMediaType" | "SESSION_EXPIRED" | "BidTooLow" | "AuctionClosed";
        ListingApiError: {
            statusCode: number;
            code: components["schemas"]["ListingErrorCode"];
            message: string;
            /** Format: uuid */
            requestId: string;
            fieldErrors?: components["schemas"]["FieldError"][];
            retryAfterSeconds?: number;
        };
        /** @description Ordered Ready derivative descriptor. Fetch a short-lived URL through getPublicListingMedia on demand; no storage key or permanent URL. */
        PublicListingPhoto: {
            /** Format: uuid */
            id: string;
            width: number;
            height: number;
        };
        ServiceAreaDirectory: {
            /** @constant */
            code: "HCM-DEMO-v1";
            /** @constant */
            name: "TP.HCM";
            /** @constant */
            demoOnly: true;
            localities: {
                code: string;
                label: string;
            }[];
        };
        AddressInput: {
            recipientName: string;
            phone: string;
            serviceAreaCode: string;
            localityCode: string;
            detail: string;
        };
        PrivateAddress: {
            /** Format: uuid */
            id: string;
            recipientName: string;
            phone: string;
            serviceAreaCode: string;
            localityCode: string;
            detail: string;
            isDefault: boolean;
            version: number;
        };
        AddressBook: {
            version: number;
            items: components["schemas"]["PrivateAddress"][];
        };
        AddressBookCommand: {
            expectedBookVersion: number;
        };
        SaveAddress: {
            expectedBookVersion: number;
            address: components["schemas"]["AddressInput"];
            makeDefault: boolean;
        };
        /** @description No recipient, phone or address data in receipts/audits. Book-wide optimistic version. Replay returns original receipt after current authorization even after address deletion; refetch book. First address automatically default; deleting default promotes oldest remaining (createdAt,id). RESTRICTED Members may maintain their private address book; this does not authorize new transactions. Demo localities are not official administrative units. */
        AddressBookReceipt: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            entityId: string;
            /** @constant */
            entityType: "AddressBook";
            version: number;
            /** Format: uuid */
            addressId: string;
            /** Format: date-time */
            serverTime: string;
        };
        /** @description Private origin reference, no contact snapshot. The server checks ownership and the current address version under locks. ViaPoint is not implemented. */
        ListingFulfillment: {
            /** Format: uuid */
            originAddressId: string;
            originAddressVersion: number;
            /** @constant */
            method: "DirectDelivery";
        };
        /** @description Safe delivery preference only, not a quote or enabled checkout. Never contains an address ID, version, locality or contact details. */
        PublicFulfillment: {
            /** @constant */
            serviceAreaCode: "HCM-DEMO-v1";
            /** @constant */
            name: "TP.HCM";
            /** @constant */
            demoOnly: true;
            /** @constant */
            method: "DirectDelivery";
        };
        CreateSaleQuote: {
            expectedListingVersion: number;
            /** Format: uuid */
            expectedListingRevisionId: string;
            /** Format: uuid */
            destinationAddressId: string;
            expectedDestinationAddressVersion: number;
            /** @constant */
            method: "DirectDelivery";
        };
        QuoteReceipt: {
            /** Format: uuid */
            id: string;
            /** @constant */
            entityType: "SaleQuote";
            /** Format: uuid */
            entityId: string;
            /** @constant */
            version: 1;
            /** Format: date-time */
            expiresAt: string;
            /** Format: date-time */
            serverTime: string;
        };
        /** @description Private immutable price estimate with current assessment, not an order or payment. Seller proceeds assumes normal completion and reimbursement of advanced shipping. Current does not hold stock or authorize checkout; future checkout must revalidate under locks. No seller address reference/contact exposed. */
        SaleQuote: {
            /** Format: uuid */
            id: string;
            /** @constant */
            version: 1;
            /** Format: uuid */
            listingId: string;
            listingVersion: number;
            /** Format: uuid */
            listingRevisionId: string;
            /** Format: uuid */
            catalogRevisionId: string;
            /** Format: uuid */
            destinationAddressId: string;
            destinationAddressVersion: number;
            /** @constant */
            serviceAreaCode: "HCM-DEMO-v1";
            /** @constant */
            method: "DirectDelivery";
            /** @constant */
            demoOnly: true;
            policyVersion: string;
            /** @constant */
            currency: "VND";
            amounts: {
                bookPrice: number;
                shippingFee: number;
                buyerTotal: number;
                commissionBps: number;
                commission: number;
                sellerProceedsOnCompletion: number;
            };
            /** @constant */
            shippingPayer: "Buyer";
            /** @constant */
            shippingAdvancedBy: "Seller";
            /** @constant */
            reservesBook: false;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            expiresAt: string;
            /** Format: date-time */
            serverTime: string;
            /** @enum {string} */
            assessment: "Current" | "Expired" | "Changed" | "Unavailable";
        };
        CreateDirectOrder: {
            /** Format: uuid */
            quoteId: string;
            /** @constant */
            expectedQuoteVersion: 1;
            expectedListingVersion: number;
            /** Format: uuid */
            expectedListingRevisionId: string;
        };
        CancelUnpaidOrder: {
            expectedVersion: number;
        };
        OrderContact: {
            recipientName: string;
            phone: string;
            /** @constant */
            serviceAreaCode: "HCM-DEMO-v1";
            localityCode: string;
            detail: string;
        };
        OrderItemSnapshot: {
            /** Format: uuid */
            listingId: string;
            /** Format: uuid */
            listingRevisionId: string;
            /** Format: uuid */
            catalogRevisionId: string;
            metadata: components["schemas"]["CatalogMetadata"];
            /** @enum {string} */
            condition: "LikeNew" | "Good" | "Fair" | "Worn";
            pages: string;
            coverNote: string;
            notes: string;
            accessories: string;
            readable: boolean;
            hasMissingPages: boolean;
            missingEssentialContent: boolean;
            description: string;
            mediaIds: string[];
        };
        DirectOrderAgreement: {
            /** @constant */
            schemaVersion: 1;
            policyVersion: string;
            /** @constant */
            method: "DirectDelivery";
            /** @constant */
            demoOnly: true;
            /** @constant */
            currency: "VND";
            /** Format: uuid */
            buyerId: string;
            /** Format: uuid */
            sellerId: string;
            origin: components["schemas"]["OrderContact"];
            destination: components["schemas"]["OrderContact"];
            amounts: {
                bookPrice: number;
                shippingFee: number;
                buyerTotal: number;
                commissionBps: number;
                commission: number;
                sellerProceedsOnCompletion: number;
            };
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            paymentDeadline: string;
        };
        TransactionCommandReceipt: {
            /** Format: uuid */
            id: string;
            /** @constant */
            entityType: "Order";
            /** Format: uuid */
            entityId: string;
            /** Format: uuid */
            contextId: string;
            version: number;
            /** @enum {string} */
            state: "AwaitingPayment" | "PendingSellerConfirmation" | "SettlementPending" | "Cancelled" | "PaymentExpired" | "Preparing" | "ResolutionPending" | "InTransit" | "Inspection" | "Completed";
            /** Format: date-time */
            serverTime: string;
            /** Format: date-time */
            paymentDeadline: string;
            affectedListings: {
                /** Format: uuid */
                id: string;
                version: number;
            }[];
        };
        /** @description Private DirectDelivery Order including funding, pre-confirmation refund, seller acceptance and overdue pickup review. Historical schema name retained. shippingAddress is the frozen buyer destination, disclosed only to the accepted Seller. Review is an unresolved task, never proof of custody, strike or refund. Shipment registration is available through its separate endpoint; independent pickup simulation can advance InTransit or open carrierReview/ResolutionPending. Review resolution handlers remain planned. */
        PrivateUnpaidOrder: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            contextId: string;
            version: number;
            /** @enum {string} */
            state: "AwaitingPayment" | "PendingSellerConfirmation" | "SettlementPending" | "Cancelled" | "PaymentExpired" | "Preparing" | "ResolutionPending" | "InTransit" | "Inspection" | "Completed";
            /** @enum {string} */
            role: "Buyer" | "Seller";
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            paymentDeadline: string;
            /** Format: date-time */
            closedAt: string | null;
            /** Format: date-time */
            serverTime: string;
            /** Format: date-time */
            deliveredAt: string | null;
            /** Format: date-time */
            inspectionDeadline: string | null;
            /** Format: date-time */
            completedAt: string | null;
            canConfirmReceipt: boolean;
            /** Format: uuid */
            quoteId: string;
            item: components["schemas"]["OrderItemSnapshot"];
            /** @constant */
            method: "DirectDelivery";
            /** @constant */
            demoOnly: true;
            /** @constant */
            currency: "VND";
            policyVersion: string;
            amounts: {
                bookPrice: number;
                shippingFee: number;
                buyerTotal: number;
                commissionBps: number;
                commission: number;
                sellerProceedsOnCompletion: number;
            };
            ownAddress: components["schemas"]["OrderContact"];
            commitment: {
                /** Format: uuid */
                id: string;
                version: number;
                /** @enum {string} */
                status: "Active" | "Released";
            };
            canCancel: boolean;
            paymentEnabled: boolean;
            moneyHeld: number;
            /** Format: date-time */
            paidAt: string | null;
            /** Format: date-time */
            sellerConfirmationDeadline: string | null;
            /** Format: date-time */
            cancellationRequestedAt: string | null;
            /** @enum {string|null} */
            cancellationReason: null | "BuyerCancelled" | "SellerRejected" | "SellerConfirmationExpired";
            refundedAmount: number;
            canRequestRefund: boolean;
            canReject: boolean;
            sellerAcceptanceEnabled: boolean;
            preparation: null | components["schemas"]["OrderPreparation"];
            shippingAddress: null | components["schemas"]["OrderContact"];
            /** @description Current participant is Seller, Order Preparing before pickup deadline, at least one Ready packaging image, full hold, and no outbound shipment. Advisory only; POST rechecks all conditions under locks. */
            shipmentRegistrationEnabled: boolean;
            carrierReview: components["schemas"]["CarrierReview"] | null;
            deliveryReview: components["schemas"]["OrderDeliveryReview"] | null;
            /** @description Buyer, Applied pickup with pinned delivery deadline reached, full hold, InTransit/ResolutionPending and no existing Buyer report; advisory only. No Delivered event exists yet. */
            canReportNonReceipt: boolean;
        };
        CreateVNPayTopup: {
            amount: number;
        };
        CreateTopupIntent: {
            amount: number;
        };
        TopupIntent: {
            /** Format: uuid */
            id: string;
            version: number;
            amount: number;
            /** @enum {string} */
            state: "Pending" | "Processing" | "Succeeded" | "Failed" | "ReviewRequired";
            credited: boolean;
            /** Format: uuid */
            journalId: string | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
            /** @constant */
            demoOnly: true;
            /** @constant */
            label: "Mô phỏng đồ án";
            /** @constant */
            currency: "VND";
        };
        WalletSummary: {
            /** @description Current fee per new submission; default 20000 VND. Approved content edits are not charged again. */
            listingSubmissionFee?: number;
            atomicCheckout?: boolean;
            vnpayEnabled?: boolean;
            /** @constant */
            demoOnly: true;
            /** @constant */
            label: "Mô phỏng đồ án";
            /** @constant */
            currency: "VND";
            available: number;
            transactionHeld: number;
            /** @constant */
            withdrawalHeld: 0;
            total: number;
            /** Format: date-time */
            serverTime: string;
            topupEnabled: boolean;
            paymentsEnabled: boolean;
            /** @constant */
            withdrawalsEnabled: false;
        };
        WalletCommandReceipt: {
            /**
             * Format: uri
             * @description Signed sandbox URL; present only on VNPay creation receipts.
             */
            paymentUrl?: string;
            /** Format: date-time */
            expiresAt?: string;
            /** Format: uuid */
            id: string;
            /** @constant */
            entityType: "TopupIntent";
            /** Format: uuid */
            entityId: string;
            version: number;
            /** @enum {string} */
            state: "Pending" | "Processing" | "Succeeded" | "Failed" | "ReviewRequired";
            credited: boolean;
            /** Format: uuid */
            journalId: string | null;
            /** Format: date-time */
            serverTime: string;
            /** @constant */
            demoOnly: true;
            /** @constant */
            label: "Mô phỏng đồ án";
            /** @constant */
            currency: "VND";
        };
        TopupPage: {
            items: components["schemas"]["TopupIntent"][];
            /** Format: uuid */
            nextCursor: string | null;
        };
        WalletHistoryItem: {
            /** Format: uuid */
            journalId: string;
            /** Format: uuid */
            topupId: string | null;
            /** @enum {string} */
            type: "Topup" | "OrderPayment" | "OrderRefund" | "OrderSettlement" | "ListingFeeCharge" | "ListingFeeRefund" | "ListingFeeSettlement";
            amount: number;
            balanceAfter: number;
            /** Format: date-time */
            postedAt: string;
            /** @constant */
            demoOnly: true;
            /** @constant */
            label: "Mô phỏng đồ án";
            /** @constant */
            currency: "VND";
            /** Format: uuid */
            orderId: string | null;
        };
        WalletHistoryPage: {
            items: components["schemas"]["WalletHistoryItem"][];
            /** Format: uuid */
            nextCursor: string | null;
        };
        /** @description TEST_OPERATOR only; independently authorized server adapter signs this envelope with its private simulation secret. The shared verifier then processes it. Wrong amount/currency/recipient is accepted as evidence and marks ReviewRequired without credit. No public callback endpoint is exposed. */
        SimulatedTopupEvent: {
            /** Format: uuid */
            eventId: string;
            /** Format: uuid */
            intentId: string;
            /** Format: uuid */
            recipientId: string;
            amount: number;
            currency: string;
            /** @enum {string} */
            outcome: "Processing" | "Succeeded" | "Failed";
            /** Format: date-time */
            occurredAt: string;
        };
        MyOrderSummary: {
            /** Format: uuid */
            id: string;
            /** @enum {string} */
            state: "AwaitingPayment" | "PendingSellerConfirmation" | "SettlementPending" | "Cancelled" | "PaymentExpired" | "Preparing" | "ResolutionPending" | "InTransit" | "Inspection" | "Completed";
            version: number;
            /** @enum {string} */
            role: "Buyer" | "Seller";
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            paymentDeadline: string;
            /** Format: date-time */
            closedAt: string | null;
        };
        MyOrderPage: {
            items: components["schemas"]["MyOrderSummary"][];
            /** Format: uuid */
            nextCursor: string | null;
            /** Format: date-time */
            serverTime: string;
        };
        PayOrder: {
            expectedVersion: number;
        };
        CancelPaidOrder: {
            expectedVersion: number;
        };
        RejectPaidOrder: {
            expectedVersion: number;
        };
        AcceptOrder: {
            expectedVersion: number;
        };
        OrderPreparation: {
            /** Format: date-time */
            acceptedAt: string;
            /** Format: date-time */
            pickupDeadline: string;
            pickupReview: null | {
                /** Format: uuid */
                id: string;
                /** Format: date-time */
                openedAt: string;
                /** @constant */
                reason: "PickupDeadlineExceeded";
                /** @constant */
                status: "Open";
            };
        };
        /** @description Seller only after acceptance, including LOCKED. expectedVersion is the current Order version. At most 32 retained intents per Order and 20 media intents/hour/uploader across listing and packaging uploads. Immutable hash and original; no client-supplied object keys. Pending intents can be retried, including after pickup timeout; retention is conservative with no automatic deletion. */
        CreatePackagingEvidence: {
            expectedVersion: number;
            /** @enum {string} */
            mimeType: "image/jpeg" | "image/png" | "image/webp";
            byteSize: number;
            sha256: string;
        };
        PackagingEvidenceReceipt: {
            /** Format: uuid */
            id: string;
            /** @constant */
            entityType: "OrderPackagingEvidence";
            /** Format: uuid */
            entityId: string;
            /** Format: uuid */
            orderId: string;
            /** Format: uuid */
            contextId: string;
            /** @enum {integer} */
            version: 1 | 2;
            /** @enum {string} */
            state: "Pending" | "Ready";
            /** Format: date-time */
            serverTime: string;
        };
        PackagingEvidence: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            orderId: string;
            /** @enum {integer} */
            version: 1 | 2;
            /** @enum {string} */
            status: "Pending" | "Ready";
            /** @enum {string} */
            mimeType: "image/jpeg" | "image/png" | "image/webp";
            byteSize: number;
            sha256: string;
            /** Format: date-time */
            createdAt: string;
            uploadedAt: string | null;
            /** @constant */
            purpose: "Packaging";
        };
        PackagingEvidenceList: {
            items: components["schemas"]["PackagingEvidence"][];
            /** Format: date-time */
            serverTime: string;
        };
        /** @description Outer string whitespace is trimmed and evidence UUIDs lowercased before validation and idempotency hashing. Tracking remains case-sensitive uppercase; internal spaces are rejected. */
        RegisterDirectShipment: {
            expectedOrderVersion: number;
            /** @constant */
            carrier: "LatLaiSimulator";
            trackingCode: string;
            packagingEvidenceIds: string[];
        };
        ShipmentCommandReceipt: {
            /** Format: uuid */
            id: string;
            /** @constant */
            entityType: "Shipment";
            /** Format: uuid */
            entityId: string;
            /** Format: uuid */
            orderId: string;
            /** Format: uuid */
            contextId: string;
            /** @constant */
            version: 1;
            /** @constant */
            state: "LabelCreated";
            /** Format: date-time */
            serverTime: string;
        };
        PrivateDirectShipment: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            orderId: string;
            /** @enum {integer} */
            version: 1 | 2;
            /** @enum {string} */
            state: "LabelCreated" | "PickedUp";
            /** @constant */
            direction: "Outbound";
            /** @constant */
            method: "DirectDelivery";
            /** @constant */
            carrier: "LatLaiSimulator";
            trackingCode: string;
            /** @constant */
            demoOnly: true;
            /** @constant */
            label: "Mô phỏng đồ án";
            /** Format: date-time */
            registeredAt: string;
            /** Format: date-time */
            pickupDeadline: string;
            packagingEvidenceIds: string[];
            origin: components["schemas"]["OrderContact"] | null;
            destination: components["schemas"]["OrderContact"];
            shippingFee: number;
            /** @constant */
            currency: "VND";
            /** @constant */
            feePolicy: "SellerAdvanceBuyerReimbursement";
            pickupConfirmed: boolean;
            pickup: {
                /** Format: uuid */
                eventId: string;
                /** Format: date-time */
                occurredAt: string;
                /** Format: date-time */
                receivedAt: string;
                /** Format: date-time */
                deliveryDeadline: string;
            } | null;
            carrierReview: components["schemas"]["CarrierReview"] | null;
        };
        SimulatedPickupEvent: {
            /** Format: uuid */
            eventId: string;
            /** Format: uuid */
            shipmentId: string;
            /** Format: uuid */
            orderId: string;
            /** @constant */
            carrier: "LatLaiSimulator";
            trackingCode: string;
            /** @constant */
            type: "PickedUp";
            /** Format: date-time */
            occurredAt: string;
        };
        CarrierReview: {
            /** Format: uuid */
            id: string;
            /** Format: date-time */
            openedAt: string;
            /** @enum {string} */
            reason: "LatePickup" | "ConflictingPickup";
            /** @constant */
            status: "Open";
        };
        PickupEvent: {
            /** Format: uuid */
            id: string;
            sequence: number;
            /** Format: date-time */
            occurredAt: string;
            /** Format: date-time */
            receivedAt: string;
            /** @enum {string} */
            outcome: "Applied" | "Duplicate" | "ReviewRequired";
        };
        PickupEventList: {
            items: components["schemas"]["PickupEvent"][];
        };
        CarrierEventReceipt: {
            /** Format: uuid */
            id: string;
            /** @constant */
            entityType: "CarrierEvent";
            /** Format: uuid */
            entityId: string;
            /** Format: uuid */
            shipmentId: string;
            /** Format: uuid */
            orderId: string;
            /** Format: uuid */
            contextId: string;
            version: number;
            /** @constant */
            state: "Recorded";
            /** @enum {string} */
            outcome: "Applied" | "Duplicate" | "ReviewRequired";
            orderVersion: number;
            /** @enum {string} */
            orderState: "Preparing" | "InTransit" | "ResolutionPending";
            /** Format: date-time */
            serverTime: string;
        };
        SimulatedDeliveryEvent: {
            /** Format: uuid */
            eventId: string;
            /** Format: uuid */
            shipmentId: string;
            /** Format: uuid */
            orderId: string;
            /** @constant */
            carrier: "LatLaiSimulator";
            trackingCode: string;
            /** Format: date-time */
            occurredAt: string;
        };
        ConfirmOrderReceipt: {
            /** @enum {integer} */
            expectedVersion: 4;
        };
        ReportOrderNonReceipt: {
            /** @enum {integer} */
            expectedVersion: 4 | 5;
            /** @description Description of non-receipt, normalized outer whitespace; no image upload required. */
            description: string;
        };
        OrderNonReceiptReport: {
            /** Format: uuid */
            id: string;
            /** Format: date-time */
            submittedAt: string;
            /** @description Description of non-receipt, normalized outer whitespace; no image upload required. */
            description: string;
        };
        OrderDeliveryReview: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            shipmentId: string;
            /** Format: uuid */
            pickupEventId: string;
            /** Format: date-time */
            openedAt: string;
            /** Format: date-time */
            deliveryDeadline: string;
            /** @constant */
            reason: "DeliveryDeadlineExceeded";
            /** @constant */
            status: "Open";
            /** @enum {string} */
            openedBy: "DeadlineWorker" | "BuyerReport";
            /** @constant */
            policyCode: "ORDER-DELIVERY-REVIEW-v1";
            buyerReport: components["schemas"]["OrderNonReceiptReport"] | null;
        };
        /** @enum {string} */
        WishlistSubjectType: "CATALOG_BOOK" | "LISTING";
        WishlistItem: {
            /** Format: uuid */
            id: string;
            subjectType: components["schemas"]["WishlistSubjectType"];
            /** Format: uuid */
            subjectId: string;
            wantsToExchange: boolean;
            receiveNotifications: boolean;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
            book?: components["schemas"]["PublicBook"];
            listing?: components["schemas"]["PublicListing"];
        };
        SaveWishlistRequest: {
            wantsToExchange: boolean;
            receiveNotifications: boolean;
        };
        WishlistPage: {
            items: components["schemas"]["WishlistItem"][];
            nextCursor: string | null;
        };
        PayPointOrder: {
            expectedVersion: number;
        };
        AcceptPointOrderReport: {
            expectedVersion: number;
        };
        RejectPointOrderReport: {
            expectedVersion: number;
            reason: string;
        };
        RequestCollectionCode: {
            expectedVersion: number;
        };
        HandOverPointOrder: {
            expectedVersion: number;
            code: string;
        };
        CollectionCodeIssued: {
            receipt: components["schemas"]["AuctionCommandReceipt"];
            /** @description Shown once. Null on an idempotent replay; request a new code instead. */
            code: string | null;
        };
        PointCollectionItem: {
            /** Format: uuid */
            id: string;
            version: number;
            title: string;
            /** @enum {string} */
            state: "AwaitingPayment" | "Fulfilling" | "ReadyForCollection" | "Inspection" | "ResolutionPending" | "ReturnPending" | "Completed" | "Cancelled" | "PaymentExpired";
            recipientName: string;
            shelfCode: string | null;
            /** Format: date-time */
            collectionDeadline: string | null;
            /**
             * Format: date-time
             * @description ReturnPending only; the buyer brings the book back before this time.
             */
            returnDeadline: string | null;
        };
        PointCollectionQueue: {
            items: components["schemas"]["PointCollectionItem"][];
            /** Format: date-time */
            serverTime: string;
        };
        PointOrder: {
            /** Format: uuid */
            id: string;
            /** @constant */
            source: "Auction";
            /** Format: uuid */
            auctionId: string;
            /** Format: uuid */
            listingId: string;
            title: string;
            /** Format: uuid */
            pointId: string;
            pointName: string;
            /** @enum {string} */
            role: "Buyer" | "Seller";
            /** @constant */
            method: "ViaPoint";
            /** @enum {string} */
            fulfillmentMethod: "SelfCollect";
            /** @enum {string} */
            state: "AwaitingPayment" | "Fulfilling" | "ReadyForCollection" | "Inspection" | "ResolutionPending" | "ReturnPending" | "Completed" | "Cancelled" | "PaymentExpired";
            version: number;
            /** @constant */
            currency: "VND";
            /** @constant */
            demoOnly: true;
            amounts: {
                bookPrice: number;
                outboundFee: number;
                buyerTotal: number;
                commissionBps: number;
                commission: number;
                sellerProceedsOnCompletion: number;
            };
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            paymentDeadline: string;
            /** Format: date-time */
            paidAt: string | null;
            /** Format: date-time */
            closedAt: string | null;
            /** @description Condition check at the point; not authenticity (FR-T02). */
            report: {
                /** @constant */
                outcome: "Pass";
                /** Format: date-time */
                inspectedAt: string;
                note: string | null;
                scope: string;
            };
            /** Format: date-time */
            acceptanceDeadline: string | null;
            /** Format: date-time */
            acceptedAt: string | null;
            /** Format: date-time */
            collectionDeadline: string | null;
            /** Format: date-time */
            collectedAt: string | null;
            /** @description True once an Admin refund returned the Order hold to the buyer. */
            refunded: boolean;
            /** @description True once the settlement journal paid the seller and the platform from the Order hold. */
            settled: boolean;
            /**
             * Format: date-time
             * @description Set when an Admin required the book back at the point after a claim.
             */
            returnDeadline: string | null;
            /** Format: date-time */
            returnedAt: string | null;
            /** Format: date-time */
            inspectionDeadline: string | null;
            resolution: {
                /** @enum {string} */
                reason: "ReportRejected" | "RecipientDecisionOverdue" | "CollectionOverdue" | "InspectionClaim" | "ReturnOverdue";
                /** Format: date-time */
                openedAt: string;
            } | null;
            /** Format: date-time */
            serverTime: string;
        };
        AuctionCommandReceipt: {
            /** Format: uuid */
            id: string;
            /** @enum {string} */
            entityType: "AuctionIntake" | "Auction" | "PointOrder";
            /** Format: uuid */
            entityId: string;
            /** Format: uuid */
            intakeId: string;
            /** Format: uuid */
            auctionId: string | null;
            /**
             * Format: uuid
             * @description ViaPoint Order formed by a win or Buy Now.
             */
            orderId: string | null;
            /** Format: uuid */
            contextId: string;
            version: number;
            /** @enum {string} */
            state: "AwaitingDropoff" | "Received" | "Passed" | "Auctioning" | "ReclaimRequired" | "Reclaimed" | "Cancelled" | "Active" | "BuyNowPending" | "AwaitingWinnerPayment" | "Sold" | "Unsold" | "OnHold" | "PaymentExpired" | "AwaitingPayment" | "Fulfilling" | "ReadyForCollection" | "Inspection" | "ResolutionPending" | "ReturnPending" | "Completed";
            currentPrice: number | null;
            minimumBid: number | null;
            leading: boolean | null;
            /**
             * @description Staff handover only. A rejected code still commits the attempt.
             * @enum {string|null}
             */
            collectionOutcome: "HandedOver" | "WrongCode" | "Expired" | "RateLimited" | null;
            /** @description Wrong attempts left in the 15-minute window. */
            attemptsRemaining: number | null;
            /**
             * Format: date-time
             * @description Collection code request only; the code itself is never stored in receipts.
             */
            codeExpiresAt: string | null;
            /**
             * @description Staff return receipt only. A refused return is still a committed attempt.
             * @enum {string|null}
             */
            returnOutcome: "Accepted" | "Refused" | null;
            /** Format: date-time */
            serverTime: string;
        };
        CreateAuctionIntake: {
            /** Format: uuid */
            listingId: string;
            expectedListingVersion: number;
            /** Format: uuid */
            pointId: string;
            startPrice: number;
            /** @enum {integer} */
            step: 10000 | 50000;
            buyNowPrice: number | null;
        };
        AuctionVersionCommand: {
            expectedVersion: number;
        };
        ReceiveAuctionIntake: {
            expectedVersion: number;
            shelfCode: string;
        };
        InspectAuctionIntake: {
            expectedVersion: number;
            /** @enum {string} */
            outcome: "Pass" | "Fail";
            note: string | null;
        };
        CancelAuction: {
            expectedVersion: number;
            reason: string;
        };
        PlaceAuctionBid: {
            amount: number;
            /** @enum {string} */
            fulfillmentMethod: "SelfCollect";
        };
        SetAuctionAutoBid: {
            maxAmount: number;
            /** @enum {string} */
            fulfillmentMethod: "SelfCollect";
        };
        DisableAuctionAutoBid: Record<string, never>;
        BuyAuctionNow: {
            /** @enum {string} */
            fulfillmentMethod: "SelfCollect";
        };
        HandoverPoint: {
            /** Format: uuid */
            id: string;
            code: string;
            name: string;
            displayAddress: string;
            /** @enum {string} */
            status: "Active" | "Paused" | "Closed";
            capacity: number;
            availableSlots: number;
            /** @constant */
            demoOnly: true;
        };
        HandoverPointList: {
            items: components["schemas"]["HandoverPoint"][];
        };
        AuctionIntake: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            contextId: string;
            /** Format: uuid */
            listingId: string;
            /** Format: uuid */
            listingRevisionId: string;
            title: string;
            /** Format: uuid */
            pointId: string;
            startPrice: number;
            /** @enum {integer} */
            step: 10000 | 50000;
            buyNowPrice: number | null;
            protectiveValue: number;
            /** @enum {string} */
            state: "AwaitingDropoff" | "Received" | "Passed" | "Auctioning" | "ReclaimRequired" | "Reclaimed" | "Cancelled" | "Sold";
            version: number;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            dropoffDeadline: string;
            /** Format: date-time */
            receivedAt: string | null;
            /** @description Staff reads only; null for the owner. */
            shelfCode: string | null;
            /** Format: date-time */
            inspectedAt: string | null;
            /** @enum {string|null} */
            inspectionOutcome: "Pass" | "Fail" | null;
            inspectionNote: string | null;
            /** Format: uuid */
            auctionId: string | null;
            /** @enum {string|null} */
            reclaimReason: "SellerCancelled" | "InspectionFailed" | "Unsold" | "PaymentExpired" | "AuctionCancelled" | "OrderCancelled" | "OrderReturned" | "BookMisdescribed" | null;
            /** Format: date-time */
            closedAt: string | null;
        };
        AuctionIntakeList: {
            items: components["schemas"]["AuctionIntake"][];
        };
        MyAuctionPage: {
            items: {
                auction: components["schemas"]["PublicAuctionSummary"];
                /** @enum {string} */
                role: "Seller" | "Bidder";
                leading: boolean;
                won: boolean;
                needsPayment: boolean;
                /** Format: date-time */
                paymentDeadline: string | null;
            }[];
            nextCursor: string | null;
            /** Format: date-time */
            serverTime: string;
        };
        PublicAuctionBook: {
            /** Format: uuid */
            revisionId: string;
            authors: string[];
            condition: components["schemas"]["BookCondition"];
            pages: string;
            coverNote: string;
            notes: string;
            accessories: string;
            description: string;
            hasMissingPages: boolean;
            photos: {
                /** Format: uuid */
                id: string;
                width: number;
                height: number;
            }[];
        };
        PublicAuctionSummary: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            listingId: string;
            title: string;
            /** @enum {string} */
            state: "Active" | "BuyNowPending" | "AwaitingWinnerPayment" | "Sold" | "Unsold" | "OnHold" | "Cancelled" | "PaymentExpired";
            startPrice: number;
            /** @enum {integer} */
            step: 10000 | 50000;
            /** @description Null once the first valid bid exists or the auction is not Active. */
            buyNowPrice: number | null;
            currentPrice: number | null;
            /** @description Null when bidding is closed. */
            minimumBid: number | null;
            bidderCount: number;
            /** Format: date-time */
            startAt: string;
            /** Format: date-time */
            endAt: string;
            pointName: string;
            /** @description Approved, inspected intake revision. Null when no longer eligible for public book/media reads. Optional for compatibility with older clients; never includes seller identity or inspection notes. */
            book?: components["schemas"]["PublicAuctionBook"] | null;
            /** @constant */
            demoOnly: true;
        };
        PublicAuctionList: {
            items: components["schemas"]["PublicAuctionSummary"][];
            /** Format: date-time */
            serverTime: string;
        };
        AuctionPriceEvent: {
            price: number;
            bidderAlias: number;
            /** Format: date-time */
            at: string;
        };
        PublicAuction: {
            auction: components["schemas"]["PublicAuctionSummary"];
            leaderAlias: number | null;
            history: components["schemas"]["AuctionPriceEvent"][];
            /** Format: date-time */
            serverTime: string;
        };
        AuctionParticipation: {
            /** Format: uuid */
            auctionId: string;
            /** @description Null for a Buy Now buyer, who never bid. */
            alias: number | null;
            /** @enum {string|null} */
            mode: "Manual" | "Auto" | null;
            /** @description Own manual amount or own private Auto ceiling. */
            ownLevel: number | null;
            boughtNow: boolean;
            leading: boolean;
            /** @enum {string} */
            state: "Active" | "BuyNowPending" | "AwaitingWinnerPayment" | "Sold" | "Unsold" | "OnHold" | "Cancelled" | "PaymentExpired";
            currentPrice: number | null;
            minimumBid: number | null;
            /** @enum {string} */
            fulfillmentMethod: "SelfCollect";
            won: boolean;
            /**
             * Format: uuid
             * @description ViaPoint Order of the winner, readable at /me/point-orders/{orderId}.
             */
            orderId: string | null;
            finalPrice: number | null;
            /** Format: date-time */
            paymentDeadline: string | null;
            /** Format: date-time */
            serverTime: string;
        };
        ResolvePointOrder: {
            expectedVersion: number;
            /** @enum {string} */
            decision: "RefundBuyer" | "ResumeCollection" | "DismissClaim" | "RequireReturn";
            /**
             * @description Required with RefundBuyer, absent or null otherwise. BookMisdescribed only for ReportRejected; BuyerDefault only for RecipientDecisionOverdue and CollectionOverdue and records a member violation.
             * @enum {string|null}
             */
            fault?: "BookMisdescribed" | "BuyerDefault" | "NoFault" | null;
            reason: string;
        };
        PointOrderResolutionItem: {
            /** Format: uuid */
            id: string;
            version: number;
            title: string;
            pointName: string;
            /** @enum {string} */
            openReason: "ReportRejected" | "RecipientDecisionOverdue" | "CollectionOverdue" | "InspectionClaim" | "ReturnOverdue";
            note: string | null;
            /** Format: date-time */
            openedAt: string;
            buyerTotal: number;
        };
        PointOrderResolutionQueue: {
            items: components["schemas"]["PointOrderResolutionItem"][];
            /** Format: date-time */
            serverTime: string;
        };
        ClaimPointOrder: {
            expectedVersion: number;
            description: string;
        };
        ReceivePointOrderReturn: {
            expectedVersion: number;
            /**
             * @description Staff compare the returned item with the point condition report. DoesNotMatch needs a note of at least 10 characters and refuses the return.
             * @enum {string}
             */
            check: "MatchesReport" | "DoesNotMatch";
            note?: string | null;
        };
        /** @enum {string} */
        ExchangeStatus: "Proposed" | "AcceptedAwaitingFunding" | "Preparing" | "InTransit" | "Delivered" | "Completed" | "Cancelled" | "ResolutionPending";
        /** @enum {string} */
        ExchangeCancelReason: "FundingExpired" | "ProposalExpired" | "CancelledByUser" | "ListingUnavailable";
        /** @enum {string} */
        ExchangeCancelledBy: "System" | "Initiator" | "Recipient";
        Exchange: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            initiatorId: string;
            /** Format: uuid */
            recipientId: string;
            /** Format: uuid */
            initiatorListingId: string;
            /** Format: uuid */
            recipientListingId: string;
            status: components["schemas"]["ExchangeStatus"];
            revision: number;
            initiatorDeposit: number;
            recipientDeposit: number;
            diffAmount: number;
            diffPayerId: string | null;
            fundingDeadline?: string | null;
            initiatorFundedAt?: string | null;
            recipientFundedAt?: string | null;
            rejectionReason?: string | null;
            cancelReason?: components["schemas"]["ExchangeCancelReason"] | null;
            cancelledBy?: components["schemas"]["ExchangeCancelledBy"] | null;
            cancelledAt?: string | null;
            initiatorShippedAt?: string | null;
            recipientShippedAt?: string | null;
            initiatorReceivedAt?: string | null;
            recipientReceivedAt?: string | null;
            proposalExpiresAt?: string | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        ExchangePage: {
            items: components["schemas"]["Exchange"][];
            nextCursor: string | null;
        };
        CreateExchangeProposal: {
            /** Format: uuid */
            initiatorListingId: string;
            /** Format: uuid */
            recipientListingId: string;
        };
        AcceptExchange: {
            revision: number;
        };
        RejectExchangeCommand: {
            expectedVersion: number;
            reason: string;
        };
    };
    responses: {
        /** @description Stable error code and request ID. No secrets or internal exceptions. */
        Error: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ApiError"];
            };
        };
        /** @description Stable listing error; no internal exception text. 400 malformed input/cursor; 401 UNAUTHORIZED; 403 FORBIDDEN/AccountIneligible/SelfReviewForbidden; 404 NOT_FOUND; 409 VersionConflict/InvalidState/IdempotencyConflict/CatalogDuplicate/CatalogNotConfirmed/UploadIncomplete/UploadExpired; 422 ListingInvalid/MediaNotReady/VALIDATION_ERROR with safe fieldErrors; 413 PayloadTooLarge; 415 UnsupportedMediaType; 429 RATE_LIMITED/MediaQuotaExceeded with retryAfterSeconds and Retry-After; 500 INTERNAL_ERROR; 503 UNAVAILABLE. */
        ListingError: {
            headers: {
                /** @description Present on 429; seconds until another attempt may be made. */
                "Retry-After"?: number;
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ListingApiError"];
            };
        };
    };
    parameters: never;
    requestBodies: {
        RefreshToken: {
            content: {
                "application/json": components["schemas"]["RefreshRequest"];
            };
        };
    };
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    getHealth: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Process is running. Does not check dependencies. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HealthResponse"];
                };
            };
        };
    };
    getReadiness: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Database is reachable. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HealthResponse"];
                };
            };
            503: components["responses"]["Error"];
        };
    };
    registerAccount: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RegisterRequest"];
            };
        };
        responses: {
            /** @description Request accepted without revealing account existence. Email delivery is asynchronous. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AccountRequestAcknowledgement"];
                };
            };
            400: components["responses"]["Error"];
            429: components["responses"]["Error"];
            503: components["responses"]["Error"];
        };
    };
    resendEmailVerification: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AccountEmailRequest"];
            };
        };
        responses: {
            /** @description Request accepted without revealing account existence. Email delivery is asynchronous. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AccountRequestAcknowledgement"];
                };
            };
            400: components["responses"]["Error"];
            429: components["responses"]["Error"];
            503: components["responses"]["Error"];
        };
    };
    verifyEmail: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AuthActionTokenRequest"];
            };
        };
        responses: {
            /** @description Completed. The link cannot be used again. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["Error"];
            429: components["responses"]["Error"];
            503: components["responses"]["Error"];
        };
    };
    requestPasswordReset: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AccountEmailRequest"];
            };
        };
        responses: {
            /** @description Request accepted without revealing account existence. Email delivery is asynchronous. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AccountRequestAcknowledgement"];
                };
            };
            400: components["responses"]["Error"];
            429: components["responses"]["Error"];
            503: components["responses"]["Error"];
        };
    };
    resetPassword: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ResetPasswordRequest"];
            };
        };
        responses: {
            /** @description Completed. The link cannot be used again. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["Error"];
            429: components["responses"]["Error"];
            503: components["responses"]["Error"];
        };
    };
    registerAccountWithOtp: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RegisterRequest"];
            };
        };
        responses: {
            /** @description Generic challenge; eligible accounts receive asynchronous email. Opaque challenge ID is not proof of account existence. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AccountOtpAcknowledgement"];
                };
            };
            400: components["responses"]["Error"];
            429: components["responses"]["Error"];
            503: components["responses"]["Error"];
        };
    };
    requestAccountOtp: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AccountOtpRequest"];
            };
        };
        responses: {
            /** @description Generic asynchronous acknowledgement. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AccountOtpAcknowledgement"];
                };
            };
            400: components["responses"]["Error"];
            429: components["responses"]["Error"];
            503: components["responses"]["Error"];
        };
    };
    verifyEmailWithOtp: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AccountOtpCodeRequest"];
            };
        };
        responses: {
            /** @description Email verified; challenge cannot be reused. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["Error"];
            429: components["responses"]["Error"];
            503: components["responses"]["Error"];
        };
    };
    resetPasswordWithOtp: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AccountOtpResetRequest"];
            };
        };
        responses: {
            /** @description Password changed and sessions revoked. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["Error"];
            429: components["responses"]["Error"];
            503: components["responses"]["Error"];
        };
    };
    login: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LoginRequest"];
            };
        };
        responses: {
            /** @description Session created. Keep the refresh token in secure device storage. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthTokens"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            429: components["responses"]["Error"];
        };
    };
    refreshSession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: components["requestBodies"]["RefreshToken"];
        responses: {
            /** @description Persist the replacement refresh token before continuing. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthTokens"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
        };
    };
    logout: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: components["requestBodies"]["RefreshToken"];
        responses: {
            /** @description Session revoked or token already invalid. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["Error"];
        };
    };
    getCurrentUser: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description User and roles read from the database on each request. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CurrentUser"];
                };
            };
            401: components["responses"]["Error"];
        };
    };
    getCatalogTaxonomy: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Shared controlled classification vocabulary; no inventory counts. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        version: string;
                        categories: components["schemas"]["CatalogCategory"][];
                        facets: components["schemas"]["CatalogFacet"][];
                        languages: components["schemas"]["CatalogOption"][];
                    };
                };
            };
        };
    };
    listBooks: {
        parameters: {
            query?: {
                /** @description Includes descendants. Legacy known category labels resolve read-only; unknown legacy categories remain unclassified. */
                categoryId?: components["schemas"]["CatalogCategoryId"];
                /** @description Primary language of the edition, not the language being learned. */
                language?: string;
                /** @description Exact series name, Unicode-normalized and case-insensitive. */
                series?: string;
                /** @description JSON CatalogAttributes object. Requires categoryId for nonempty values. OR within a facet; AND between facets. Parent categories accept compatible descendant contexts. Unknown/inapplicable values or incompatible grade/level return 422. Normalized selections bind the cursor. */
                facets?: string;
                limit?: number;
                /** @description Opaque signed keyset cursor bound to normalized filters and caller scope. Malformed, modified or mismatched cursor: 400. No snapshot guarantee. Every page rechecks authorization. */
                cursor?: string;
                /** @description Trim; case/accent-insensitive title/author substring; ISBN canonical equality. Escape LIKE wildcards as literal text. */
                q?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful read. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BookPage"];
                };
            };
            400: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    getBook: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                bookId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful read. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicBook"];
                };
            };
            400: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    createCatalogRequest: {
        parameters: {
            query?: never;
            header: {
                /** @description One key per intent; scoped by actor and operationId. Fingerprint includes method, path IDs and canonical body. Different payload with same key: 409. Required for all domain mutations. */
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateCatalogRequest"];
            };
        };
        responses: {
            /** @description Committed receipt (including replay). */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    /** @description true only for a previously committed command. */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MutationReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    listMyCatalogRequests: {
        parameters: {
            query?: {
                limit?: number;
                /** @description Opaque signed keyset cursor bound to normalized filters and caller scope. Malformed, modified or mismatched cursor: 400. No snapshot guarantee. Every page rechecks authorization. */
                cursor?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful read. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CatalogRequestPage"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    getMyCatalogRequest: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                bookId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful read. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PrivateCatalogRequest"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    resubmitCatalogRequest: {
        parameters: {
            query?: never;
            header: {
                /** @description One key per intent; scoped by actor and operationId. Fingerprint includes method, path IDs and canonical body. Different payload with same key: 409. Required for all domain mutations. */
                "Idempotency-Key": string;
            };
            path: {
                bookId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ResubmitCatalogRequest"];
            };
        };
        responses: {
            /** @description Committed receipt (including replay). */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    /** @description true only for a previously committed command. */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MutationReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    listCatalogReviewQueue: {
        parameters: {
            query?: {
                limit?: number;
                /** @description Opaque signed keyset cursor bound to normalized filters and caller scope. Malformed, modified or mismatched cursor: 400. No snapshot guarantee. Every page rechecks authorization. */
                cursor?: string;
                status?: components["schemas"]["CatalogStatus"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful read. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CatalogRequestPage"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    getCatalogReview: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                bookId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful read. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PrivateCatalogRequest"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    decideCatalogRequest: {
        parameters: {
            query?: never;
            header: {
                /** @description One key per intent; scoped by actor and operationId. Fingerprint includes method, path IDs and canonical body. Different payload with same key: 409. Required for all domain mutations. */
                "Idempotency-Key": string;
            };
            path: {
                bookId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DecideCatalog"];
            };
        };
        responses: {
            /** @description Committed receipt (including replay). */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    /** @description true only for a previously committed command. */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MutationReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    listPublicListings: {
        parameters: {
            query?: {
                /** @description Includes descendants. Legacy known category labels resolve read-only; unknown legacy categories remain unclassified. */
                categoryId?: components["schemas"]["CatalogCategoryId"];
                /** @description Primary language of the edition, not the language being learned. */
                language?: string;
                /** @description Exact series name, Unicode-normalized and case-insensitive. */
                series?: string;
                /** @description JSON CatalogAttributes object. Requires categoryId for nonempty values. OR within a facet; AND between facets. Parent categories accept compatible descendant contexts. Unknown/inapplicable values or incompatible grade/level return 422. Normalized selections bind the cursor. */
                facets?: string;
                limit?: number;
                /** @description Opaque base64url keyset cursor bound to normalized filters, sort and caller scope. Invalid/mismatched cursor: 400. No snapshot guarantee. All pages recheck eligibility. */
                cursor?: string;
                /** @description Trim; case/accent-insensitive title/author substring; ISBN canonical equality. Escape LIKE wildcards as literal text. */
                q?: string;
                bookId?: string;
                /** @description Sale or Exchange includes Both. Both means Both only. */
                mode?: components["schemas"]["ListingMode"];
                condition?: components["schemas"]["BookCondition"];
                minSalePrice?: number;
                maxSalePrice?: number;
                minExchangeValue?: number;
                maxExchangeValue?: number;
                /** @description Price sort/filter excludes null values. Newest: publishedAt,id DESC; price: value then id in same direction. min > max: 422. Combined filters AND. */
                sort?: "newest" | "salePriceAsc" | "salePriceDesc" | "exchangeValueAsc" | "exchangeValueDesc";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful read. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicListingPage"];
                };
            };
            400: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    createListingDraft: {
        parameters: {
            query?: never;
            header: {
                /** @description One key per intent; scoped by actor and operationId. Fingerprint includes method, path IDs and canonical body. Different payload with same key: 409. Required for all domain mutations. */
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateDraft"];
            };
        };
        responses: {
            /** @description Committed receipt (including replay). */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    /** @description true only for a previously committed command. */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MutationReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    getPublicListing: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                listingId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful read. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicListing"];
                };
            };
            400: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    createPurchaseConversation: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                listingId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreatePurchaseConversation"];
            };
        };
        responses: {
            /** @description Conversation created or idempotently replayed. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    "Idempotency-Replayed"?: "true" | "false";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PurchaseConversationReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    listMyPurchaseConversations: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current user's buyer/seller conversations. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PurchaseConversation"][];
                };
            };
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
        };
    };
    listMyNotifications: {
        parameters: {
            query?: {
                cursor?: string;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description One page of the caller's notifications and the unread total. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MemberNotificationPage"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
        };
    };
    markMyNotificationsRead: {
        parameters: {
            query?: never;
            header: {
                /** @description One key per intent, like every mutation; repeating it is harmless. */
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MarkNotificationsRead"];
            };
        };
        responses: {
            /** @description Remaining unread notifications. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NotificationUnreadCount"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
        };
    };
    listPurchaseMessages: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                conversationId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Messages in a conversation the current user participates in. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PurchaseMessage"][];
                };
            };
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
        };
    };
    listMyListings: {
        parameters: {
            query?: {
                limit?: number;
                /** @description Opaque signed keyset cursor bound to normalized filters and caller scope. Malformed, modified or mismatched cursor: 400. No snapshot guarantee. Every page rechecks authorization. */
                cursor?: string;
                moderation?: components["schemas"]["ModerationStatus"];
                visibility?: components["schemas"]["VisibilityStatus"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful read. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PrivateListingPage"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    getMyListing: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                listingId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful read. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PrivateListing"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    listMyListingRevisions: {
        parameters: {
            query?: {
                limit?: number;
                /** @description Opaque signed keyset cursor bound to normalized filters and caller scope. Malformed, modified or mismatched cursor: 400. No snapshot guarantee. Every page rechecks authorization. */
                cursor?: string;
            };
            header?: never;
            path: {
                listingId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful read. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ListingRevisionPage"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    saveListingDraft: {
        parameters: {
            query?: never;
            header: {
                /** @description One key per intent; scoped by actor and operationId. Fingerprint includes method, path IDs and canonical body. Different payload with same key: 409. Required for all domain mutations. */
                "Idempotency-Key": string;
            };
            path: {
                listingId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SaveDraft"];
            };
        };
        responses: {
            /** @description Committed receipt (including replay). */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    /** @description true only for a previously committed command. */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MutationReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    submitListing: {
        parameters: {
            query?: never;
            header: {
                /** @description One key per intent; scoped by actor and operationId. Fingerprint includes method, path IDs and canonical body. Different payload with same key: 409. Required for all domain mutations. */
                "Idempotency-Key": string;
            };
            path: {
                listingId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SubmitListing"];
            };
        };
        responses: {
            /** @description Committed receipt (including replay). */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    /** @description true only for a previously committed command. */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MutationReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    reviseApprovedListing: {
        parameters: {
            query?: never;
            header: {
                /** @description One key per intent; scoped by actor and operationId. Fingerprint includes method, path IDs and canonical body. Different payload with same key: 409. Required for all domain mutations. */
                "Idempotency-Key": string;
            };
            path: {
                listingId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EditApproved"];
            };
        };
        responses: {
            /** @description Committed receipt (including replay). */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    /** @description true only for a previously committed command. */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MutationReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    requestPriceSuggestion: {
        parameters: {
            query?: never;
            header: {
                /** @description One key per suggestion request; scoped by actor. Same key and body replays the stored outcome; a different listing or body with the same key is 409. */
                "Idempotency-Key": string;
            };
            path: {
                listingId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PriceSuggestionRequest"];
            };
        };
        responses: {
            /** @description Suggestion, rule-based refusal or missing-data answer. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PriceSuggestion"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    setListingVisibility: {
        parameters: {
            query?: never;
            header: {
                /** @description One key per intent; scoped by actor and operationId. Fingerprint includes method, path IDs and canonical body. Different payload with same key: 409. Required for all domain mutations. */
                "Idempotency-Key": string;
            };
            path: {
                listingId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SetVisibility"];
            };
        };
        responses: {
            /** @description Committed receipt (including replay). */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    /** @description true only for a previously committed command. */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MutationReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    archiveListing: {
        parameters: {
            query?: never;
            header: {
                /** @description One key per intent; scoped by actor and operationId. Fingerprint includes method, path IDs and canonical body. Different payload with same key: 409. Required for all domain mutations. */
                "Idempotency-Key": string;
            };
            path: {
                listingId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VersionCommand"];
            };
        };
        responses: {
            /** @description Committed receipt (including replay). */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    /** @description true only for a previously committed command. */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MutationReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    listListingReviewQueue: {
        parameters: {
            query?: {
                limit?: number;
                /** @description Opaque base64url keyset cursor bound to normalized filters, sort and caller scope. Invalid/mismatched cursor: 400. No snapshot guarantee. All pages recheck eligibility. */
                cursor?: string;
                moderation?: "PendingReview" | "Approved" | "Rejected";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful read. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PrivateListingPage"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    listOperationsUsers: {
        parameters: {
            query?: {
                limit?: number;
                /** @description Opaque keyset cursor bound to filters and caller scope. Invalid or mismatched cursors return 400; every page rechecks authorization. */
                cursor?: string;
                /** @description Case-insensitive email or display-name search. */
                q?: string;
                status?: components["schemas"]["ManagedUserStatus"];
                role?: components["schemas"]["RoleCode"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful read. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OperationsUserPage"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            500: components["responses"]["Error"];
            503: components["responses"]["Error"];
        };
    };
    getListingReview: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                listingId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful read. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PrivateListing"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    listReviewRevisions: {
        parameters: {
            query?: {
                limit?: number;
                /** @description Opaque base64url keyset cursor bound to normalized filters, sort and caller scope. Invalid/mismatched cursor: 400. No snapshot guarantee. All pages recheck eligibility. */
                cursor?: string;
            };
            header?: never;
            path: {
                listingId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful read. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ListingRevisionPage"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    decideListing: {
        parameters: {
            query?: never;
            header: {
                /** @description One key per intent; scoped by actor and operationId. Fingerprint includes method, path IDs and canonical body. Different payload with same key: 409. Required for all domain mutations. */
                "Idempotency-Key": string;
            };
            path: {
                listingId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DecideListing"];
            };
        };
        responses: {
            /** @description Committed receipt (including replay). */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    /** @description true only for a previously committed command. */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MutationReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    removeListing: {
        parameters: {
            query?: never;
            header: {
                /** @description One key per intent; scoped by actor and operationId. Fingerprint includes method, path IDs and canonical body. Different payload with same key: 409. Required for all domain mutations. */
                "Idempotency-Key": string;
            };
            path: {
                listingId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RemoveListing"];
            };
        };
        responses: {
            /** @description Committed receipt (including replay). */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    /** @description true only for a previously committed command. */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MutationReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    createListingUpload: {
        parameters: {
            query?: never;
            header: {
                /** @description One key per intent; scoped by actor and operationId. Fingerprint includes method, path IDs and canonical body. Different payload with same key: 409. Required for all domain mutations. */
                "Idempotency-Key": string;
            };
            path: {
                listingId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateUpload"];
            };
        };
        responses: {
            /** @description Committed receipt (including replay). */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    /** @description true only for a previously committed command. */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MutationReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            413: components["responses"]["ListingError"];
            415: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    listMyListingMedia: {
        parameters: {
            query?: {
                limit?: number;
                /** @description Opaque base64url keyset cursor bound to normalized filters, sort and caller scope. Invalid/mismatched cursor: 400. No snapshot guarantee. All pages recheck eligibility. */
                cursor?: string;
            };
            header?: never;
            path: {
                listingId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful read. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ListingMediaPage"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    getMyListingMedia: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                listingId: string;
                mediaId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful read. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ListingMedia"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    getUploadTicket: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                listingId: string;
                mediaId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful read. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UploadTicket"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    finalizeListingUpload: {
        parameters: {
            query?: never;
            header: {
                /** @description One key per intent; scoped by actor and operationId. Fingerprint includes method, path IDs and canonical body. Different payload with same key: 409. Required for all domain mutations. */
                "Idempotency-Key": string;
            };
            path: {
                listingId: string;
                mediaId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VersionCommand"];
            };
        };
        responses: {
            /** @description Committed receipt (including replay). */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    /** @description true only for a previously committed command. */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MutationReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            413: components["responses"]["ListingError"];
            415: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    getPublicListingMedia: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                listingId: string;
                mediaId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful read. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MediaRead"];
                };
            };
            400: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    getMyListingMediaRead: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                listingId: string;
                mediaId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful read. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MediaRead"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    getReviewMediaRead: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                listingId: string;
                mediaId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful read. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MediaRead"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    uploadListingContent: {
        parameters: {
            query?: never;
            header: {
                /** @description One key per intent; scoped by actor and operationId. Fingerprint includes method, path IDs and canonical body. Different payload with same key: 409. Required for all domain mutations. */
                "Idempotency-Key": string;
                "Upload-Token": string;
            };
            path: {
                listingId: string;
                mediaId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "image/jpeg": string;
                "image/png": string;
                "image/webp": string;
            };
        };
        responses: {
            /** @description Committed receipt (including replay). */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    /** @description true only for a previously committed command. */
                    "Idempotency-Replayed"?: boolean;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MutationReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            413: components["responses"]["ListingError"];
            415: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    getServiceAreaDirectory: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ServiceAreaDirectory"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
            503: components["responses"]["Error"];
        };
    };
    getMyWishlist: {
        parameters: {
            query?: {
                limit?: number;
                cursor?: string;
                subjectType?: "CATALOG_BOOK" | "LISTING";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WishlistPage"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            429: components["responses"]["Error"];
            503: components["responses"]["Error"];
        };
    };
    saveBookToWishlist: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                bookId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SaveWishlistRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WishlistItem"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            429: components["responses"]["Error"];
            503: components["responses"]["Error"];
        };
    };
    removeBookFromWishlist: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                bookId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Removed */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            429: components["responses"]["Error"];
            503: components["responses"]["Error"];
        };
    };
    saveListingToWishlist: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                listingId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SaveWishlistRequest"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WishlistItem"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            429: components["responses"]["Error"];
            503: components["responses"]["Error"];
        };
    };
    removeListingFromWishlist: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                listingId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Removed */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            429: components["responses"]["Error"];
            503: components["responses"]["Error"];
        };
    };
    getMyAddressBook: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AddressBook"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
            503: components["responses"]["Error"];
        };
    };
    createMyAddress: {
        parameters: {
            query?: never;
            header: {
                /** @description One key per intent; scoped by actor and operationId. Fingerprint includes method, path IDs and canonical body. Different payload with same key: 409. Required for all domain mutations. */
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SaveAddress"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AddressBookReceipt"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
            503: components["responses"]["Error"];
        };
    };
    updateMyAddress: {
        parameters: {
            query?: never;
            header: {
                /** @description One key per intent; scoped by actor and operationId. Fingerprint includes method, path IDs and canonical body. Different payload with same key: 409. Required for all domain mutations. */
                "Idempotency-Key": string;
            };
            path: {
                addressId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SaveAddress"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AddressBookReceipt"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
            503: components["responses"]["Error"];
        };
    };
    setMyDefaultAddress: {
        parameters: {
            query?: never;
            header: {
                /** @description One key per intent; scoped by actor and operationId. Fingerprint includes method, path IDs and canonical body. Different payload with same key: 409. Required for all domain mutations. */
                "Idempotency-Key": string;
            };
            path: {
                addressId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AddressBookCommand"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AddressBookReceipt"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
            503: components["responses"]["Error"];
        };
    };
    deleteMyAddress: {
        parameters: {
            query?: never;
            header: {
                /** @description One key per intent; scoped by actor and operationId. Fingerprint includes method, path IDs and canonical body. Different payload with same key: 409. Required for all domain mutations. */
                "Idempotency-Key": string;
            };
            path: {
                addressId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AddressBookCommand"];
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AddressBookReceipt"];
                };
            };
            400: components["responses"]["Error"];
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
            503: components["responses"]["Error"];
        };
    };
    createSaleQuote: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                listingId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateSaleQuote"];
            };
        };
        responses: {
            /** @description Successful quote operation. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    "Idempotency-Replayed"?: "true" | "false";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["QuoteReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    getMySaleQuote: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                quoteId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful quote operation. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SaleQuote"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    createDirectOrder: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateDirectOrder"];
            };
        };
        responses: {
            /** @description Successful operation. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    "Idempotency-Replayed"?: "true" | "false";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TransactionCommandReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    getMyOrder: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                orderId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful operation. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PrivateUnpaidOrder"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    cancelUnpaidOrder: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                orderId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CancelUnpaidOrder"];
            };
        };
        responses: {
            /** @description Successful operation. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    "Idempotency-Replayed"?: "true" | "false";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TransactionCommandReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    getMyOrderMedia: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                orderId: string;
                mediaId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful operation. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MediaRead"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    getMyWallet: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful simulated operation. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WalletSummary"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    createVNPayTopup: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateVNPayTopup"];
            };
        };
        responses: {
            /** @description Pending topup and signed sandbox URL; not a payment receipt. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    "Idempotency-Replayed"?: "true" | "false";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WalletCommandReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    queryMyVNPayTopup: {
        parameters: {
            query?: never;
            header: {
                /** @description Must equal topupId. Rechecks the same intent; successful credit is independently deduplicated by verified provider evidence, including concurrent IPN. An unconfirmed query is not a cached payment receipt. */
                "Idempotency-Key": string;
            };
            path: {
                topupId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current owner-checked topup state after querying VNPay. Terminal intents are read without another provider query. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TopupIntent"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    receiveVNPayIpn: {
        parameters: {
            query: {
                vnp_TxnRef: string;
                vnp_TmnCode: string;
                vnp_Amount: string;
                vnp_ResponseCode: string;
                vnp_TransactionStatus: string;
                vnp_TransactionNo: string;
                vnp_PayDate?: string;
                vnp_SecureHash: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description VNPay protocol acknowledgement; 00 accepted, 02 already processed, 01 unknown reference, 04 wrong amount, 97 unauthenticated callback, 99 retryable processing error. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {string} */
                        RspCode: "00" | "01" | "02" | "04" | "97" | "99";
                        Message: string;
                    };
                };
            };
        };
    };
    listMyTopups: {
        parameters: {
            query?: {
                limit?: number;
                cursor?: string;
                from?: string;
                to?: string;
                state?: "Pending" | "Processing" | "Succeeded" | "Failed" | "ReviewRequired";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful simulated operation. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TopupPage"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    createTopupIntent: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateTopupIntent"];
            };
        };
        responses: {
            /** @description Successful simulated operation. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    "Idempotency-Replayed"?: "true" | "false";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WalletCommandReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    getMyTopup: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                topupId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful simulated operation. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TopupIntent"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    listMyWalletHistory: {
        parameters: {
            query?: {
                limit?: number;
                cursor?: string;
                from?: string;
                to?: string;
                type?: "Topup" | "OrderPayment" | "OrderRefund" | "ListingFeeCharge" | "ListingFeeRefund" | "ListingFeeSettlement" | "OrderSettlement";
                topupId?: string;
                orderId?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful simulated operation. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WalletHistoryPage"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    emitSimulatedTopupEvent: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SimulatedTopupEvent"];
            };
        };
        responses: {
            /** @description Successful simulated operation. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    "Idempotency-Replayed"?: "true" | "false";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WalletCommandReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    listMyOrders: {
        parameters: {
            query?: {
                limit?: number;
                cursor?: string;
                state?: "AwaitingPayment" | "PendingSellerConfirmation" | "SettlementPending" | "Cancelled" | "PaymentExpired" | "Preparing" | "ResolutionPending" | "InTransit" | "Inspection" | "Completed";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful operation. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MyOrderPage"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    payOrder: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                orderId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PayOrder"];
            };
        };
        responses: {
            /** @description Successful operation. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    "Idempotency-Replayed"?: "true" | "false";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TransactionCommandReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    cancelPaidOrder: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                orderId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CancelPaidOrder"];
            };
        };
        responses: {
            /** @description Successful operation. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    "Idempotency-Replayed"?: "true" | "false";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TransactionCommandReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    rejectPaidOrder: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                orderId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RejectPaidOrder"];
            };
        };
        responses: {
            /** @description Successful operation. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    "Idempotency-Replayed"?: "true" | "false";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TransactionCommandReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    acceptOrder: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                orderId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AcceptOrder"];
            };
        };
        responses: {
            /** @description Successful operation. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    "Idempotency-Replayed"?: "true" | "false";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TransactionCommandReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    createPackagingEvidence: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                orderId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreatePackagingEvidence"];
            };
        };
        responses: {
            /** @description Successful operation. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    "Idempotency-Replayed"?: "true" | "false";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PackagingEvidenceReceipt"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            413: components["responses"]["Error"];
            415: components["responses"]["Error"];
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
            503: components["responses"]["Error"];
        };
    };
    uploadPackagingEvidence: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                orderId: string;
                evidenceId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "image/jpeg": string;
                "image/png": string;
                "image/webp": string;
            };
        };
        responses: {
            /** @description Successful operation. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    "Idempotency-Replayed"?: "true" | "false";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PackagingEvidenceReceipt"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            413: components["responses"]["Error"];
            415: components["responses"]["Error"];
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
            503: components["responses"]["Error"];
        };
    };
    listPackagingEvidence: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                orderId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful operation. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PackagingEvidenceList"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            413: components["responses"]["Error"];
            415: components["responses"]["Error"];
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
            503: components["responses"]["Error"];
        };
    };
    readPackagingEvidence: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                orderId: string;
                evidenceId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful operation. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MediaRead"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            413: components["responses"]["Error"];
            415: components["responses"]["Error"];
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
            503: components["responses"]["Error"];
        };
    };
    registerDirectShipment: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                orderId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RegisterDirectShipment"];
            };
        };
        responses: {
            /** @description Successful operation. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    "Idempotency-Replayed"?: "true" | "false";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ShipmentCommandReceipt"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            422: components["responses"]["Error"];
            503: components["responses"]["Error"];
        };
    };
    getMyDirectShipment: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                orderId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful operation. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PrivateDirectShipment"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            422: components["responses"]["Error"];
            503: components["responses"]["Error"];
        };
    };
    emitSimulatedPickupEvent: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SimulatedPickupEvent"];
            };
        };
        responses: {
            /** @description Successful operation. */
            200: {
                headers: {
                    /** @description Private response; never cache. */
                    "Cache-Control"?: "no-store";
                    /** @description Whether the original committed receipt was replayed. */
                    "Idempotency-Replayed"?: "true" | "false";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CarrierEventReceipt"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
            503: components["responses"]["Error"];
        };
    };
    emitSimulatedDeliveryEvent: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SimulatedDeliveryEvent"];
            };
        };
        responses: {
            /** @description Delivery recorded. */
            200: {
                headers: {
                    /** @description Private response; never cache. */
                    "Cache-Control"?: "no-store";
                    /** @description Whether the original committed receipt was replayed. */
                    "Idempotency-Replayed"?: "true" | "false";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TransactionCommandReceipt"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
            503: components["responses"]["Error"];
        };
    };
    confirmOrderReceipt: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                orderId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ConfirmOrderReceipt"];
            };
        };
        responses: {
            /** @description Receipt confirmation recorded. */
            200: {
                headers: {
                    /** @description Private response; never cache. */
                    "Cache-Control"?: "no-store";
                    /** @description Whether the original committed receipt was replayed. */
                    "Idempotency-Replayed"?: "true" | "false";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TransactionCommandReceipt"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
            503: components["responses"]["Error"];
        };
    };
    listMyPickupEvents: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                orderId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful operation. */
            200: {
                headers: {
                    /** @description Private response; never cache. */
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PickupEventList"];
                };
            };
            401: components["responses"]["Error"];
            403: components["responses"]["Error"];
            404: components["responses"]["Error"];
            409: components["responses"]["Error"];
            422: components["responses"]["Error"];
            429: components["responses"]["Error"];
            503: components["responses"]["Error"];
        };
    };
    reportOrderNonReceipt: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                orderId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReportOrderNonReceipt"];
            };
        };
        responses: {
            /** @description Successful operation. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    "Idempotency-Replayed"?: "true" | "false";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TransactionCommandReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    listHandoverPoints: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful read. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HandoverPointList"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    createAuctionIntake: {
        parameters: {
            query?: never;
            header: {
                /** @description One key per intent; scoped by actor and operationId. Same key and body replays the stored receipt; a different body returns 409. */
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateAuctionIntake"];
            };
        };
        responses: {
            /** @description Committed receipt (including replay). */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    "Idempotency-Replayed"?: "true" | "false";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuctionCommandReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    listMyAuctionIntakes: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful read. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuctionIntakeList"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    getMyAuctionIntake: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                intakeId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful read. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuctionIntake"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    cancelAuctionIntake: {
        parameters: {
            query?: never;
            header: {
                /** @description One key per intent; scoped by actor and operationId. Same key and body replays the stored receipt; a different body returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                intakeId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AuctionVersionCommand"];
            };
        };
        responses: {
            /** @description Committed receipt (including replay). */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    "Idempotency-Replayed"?: "true" | "false";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuctionCommandReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    listPointAuctionIntakes: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful read. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuctionIntakeList"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    receiveAuctionIntake: {
        parameters: {
            query?: never;
            header: {
                /** @description One key per intent; scoped by actor and operationId. Same key and body replays the stored receipt; a different body returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                intakeId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReceiveAuctionIntake"];
            };
        };
        responses: {
            /** @description Committed receipt (including replay). */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    "Idempotency-Replayed"?: "true" | "false";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuctionCommandReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    inspectAuctionIntake: {
        parameters: {
            query?: never;
            header: {
                /** @description One key per intent; scoped by actor and operationId. Same key and body replays the stored receipt; a different body returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                intakeId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["InspectAuctionIntake"];
            };
        };
        responses: {
            /** @description Committed receipt (including replay). */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    "Idempotency-Replayed"?: "true" | "false";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuctionCommandReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    openAuction: {
        parameters: {
            query?: never;
            header: {
                /** @description One key per intent; scoped by actor and operationId. Same key and body replays the stored receipt; a different body returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                intakeId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AuctionVersionCommand"];
            };
        };
        responses: {
            /** @description Committed receipt (including replay). */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    "Idempotency-Replayed"?: "true" | "false";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuctionCommandReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    reclaimAuctionIntake: {
        parameters: {
            query?: never;
            header: {
                /** @description One key per intent; scoped by actor and operationId. Same key and body replays the stored receipt; a different body returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                intakeId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AuctionVersionCommand"];
            };
        };
        responses: {
            /** @description Committed receipt (including replay). */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    "Idempotency-Replayed"?: "true" | "false";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuctionCommandReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    cancelAuction: {
        parameters: {
            query?: never;
            header: {
                /** @description One key per intent; scoped by actor and operationId. Same key and body replays the stored receipt; a different body returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                auctionId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CancelAuction"];
            };
        };
        responses: {
            /** @description Committed receipt (including replay). */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    "Idempotency-Replayed"?: "true" | "false";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuctionCommandReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    listAuctions: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful read. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicAuctionList"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    listMyAuctions: {
        parameters: {
            query?: {
                limit?: number;
                cursor?: string;
                view?: "all" | "active" | "payment" | "selling";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Caller-owned auction activity. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MyAuctionPage"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
        };
    };
    getAuctionPhoto: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                auctionId: string;
                mediaId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Short-lived signed derivative. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MediaRead"];
                };
            };
            400: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    getAuction: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                auctionId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful read. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicAuction"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    getMyAuctionParticipation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                auctionId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful read. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuctionParticipation"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    placeAuctionBid: {
        parameters: {
            query?: never;
            header: {
                /** @description One key per intent; scoped by actor and operationId. Same key and body replays the stored receipt; a different body returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                auctionId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PlaceAuctionBid"];
            };
        };
        responses: {
            /** @description Committed receipt (including replay). */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    "Idempotency-Replayed"?: "true" | "false";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuctionCommandReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    setAuctionAutoBid: {
        parameters: {
            query?: never;
            header: {
                /** @description One key per intent; scoped by actor and operationId. Same key and body replays the stored receipt; a different body returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                auctionId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SetAuctionAutoBid"];
            };
        };
        responses: {
            /** @description Committed receipt (including replay). */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    "Idempotency-Replayed"?: "true" | "false";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuctionCommandReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    disableAuctionAutoBid: {
        parameters: {
            query?: never;
            header: {
                /** @description One key per intent; scoped by actor and operationId. Same key and body replays the stored receipt; a different body returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                auctionId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DisableAuctionAutoBid"];
            };
        };
        responses: {
            /** @description Committed receipt (including replay). */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    "Idempotency-Replayed"?: "true" | "false";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuctionCommandReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    getMyPointOrder: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                orderId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful read. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PointOrder"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    payPointOrder: {
        parameters: {
            query?: never;
            header: {
                /** @description One key per intent; scoped by actor and operationId. Same key and body replays the stored receipt; a different body returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                orderId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PayPointOrder"];
            };
        };
        responses: {
            /** @description Committed receipt (including replay). */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    "Idempotency-Replayed"?: "true" | "false";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuctionCommandReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    acceptPointOrderReport: {
        parameters: {
            query?: never;
            header: {
                /** @description One key per intent; scoped by actor and operationId. Same key and body replays the stored receipt; a different body returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                orderId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AcceptPointOrderReport"];
            };
        };
        responses: {
            /** @description Committed receipt (including replay). */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    "Idempotency-Replayed"?: "true" | "false";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuctionCommandReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    rejectPointOrderReport: {
        parameters: {
            query?: never;
            header: {
                /** @description One key per intent; scoped by actor and operationId. Same key and body replays the stored receipt; a different body returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                orderId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RejectPointOrderReport"];
            };
        };
        responses: {
            /** @description Committed receipt (including replay). */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    "Idempotency-Replayed"?: "true" | "false";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuctionCommandReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    claimPointOrder: {
        parameters: {
            query?: never;
            header: {
                /** @description One key per intent; scoped by actor and operationId. Same key and body replays the stored receipt; a different body returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                orderId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ClaimPointOrder"];
            };
        };
        responses: {
            /** @description Committed receipt (including replay). */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    "Idempotency-Replayed"?: "true" | "false";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuctionCommandReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    requestCollectionCode: {
        parameters: {
            query?: never;
            header: {
                /** @description One key per intent; scoped by actor and operationId. Same key and body replays the stored receipt; a different body returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                orderId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RequestCollectionCode"];
            };
        };
        responses: {
            /** @description Committed receipt (including replay). */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    "Idempotency-Replayed"?: "true" | "false";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CollectionCodeIssued"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    listPointCollections: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful read. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PointCollectionQueue"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    handOverPointOrder: {
        parameters: {
            query?: never;
            header: {
                /** @description One key per intent; scoped by actor and operationId. Same key and body replays the stored receipt; a different body returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                orderId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["HandOverPointOrder"];
            };
        };
        responses: {
            /** @description Committed receipt (including replay). */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    "Idempotency-Replayed"?: "true" | "false";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuctionCommandReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    receivePointOrderReturn: {
        parameters: {
            query?: never;
            header: {
                /** @description One key per intent; scoped by actor and operationId. Same key and body replays the stored receipt; a different body returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                orderId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReceivePointOrderReturn"];
            };
        };
        responses: {
            /** @description Committed receipt (including replay). */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    "Idempotency-Replayed"?: "true" | "false";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuctionCommandReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    listPointOrderResolutions: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful read. */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PointOrderResolutionQueue"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    resolvePointOrder: {
        parameters: {
            query?: never;
            header: {
                /** @description One key per intent; scoped by actor and operationId. Same key and body replays the stored receipt; a different body returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                orderId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ResolvePointOrder"];
            };
        };
        responses: {
            /** @description Committed receipt (including replay). */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    "Idempotency-Replayed"?: "true" | "false";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuctionCommandReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    buyAuctionNow: {
        parameters: {
            query?: never;
            header: {
                /** @description One key per intent; scoped by actor and operationId. Same key and body replays the stored receipt; a different body returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                auctionId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BuyAuctionNow"];
            };
        };
        responses: {
            /** @description Committed receipt (including replay). */
            200: {
                headers: {
                    "Cache-Control"?: "no-store";
                    "Idempotency-Replayed"?: "true" | "false";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuctionCommandReceipt"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            429: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
            503: components["responses"]["ListingError"];
        };
    };
    listExchanges: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExchangePage"];
                };
            };
            401: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
        };
    };
    createExchangeProposal: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateExchangeProposal"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Exchange"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            422: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
        };
    };
    getExchange: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Exchange"];
                };
            };
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
        };
    };
    acceptExchange: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AcceptExchange"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Exchange"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
        };
    };
    fundExchange: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Exchange"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
        };
    };
    cancelExchange: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VersionCommand"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Exchange"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
        };
    };
    rejectExchange: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RejectExchangeCommand"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Exchange"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
        };
    };
    shipExchange: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VersionCommand"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Exchange"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
        };
    };
    receiveExchange: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VersionCommand"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Exchange"];
                };
            };
            400: components["responses"]["ListingError"];
            401: components["responses"]["ListingError"];
            403: components["responses"]["ListingError"];
            404: components["responses"]["ListingError"];
            409: components["responses"]["ListingError"];
            500: components["responses"]["ListingError"];
        };
    };
}
