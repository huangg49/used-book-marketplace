# Flutter architecture

Target structure for future slices. The current app is a scaffold in `lib/main.dart`;
the directories and auth flow below are not implemented merely because they are
described here. Start with [AI workflow](../../docs/AI_WORKFLOW.md), the shared API
contract and brand, then deliver one assigned slice with real integration.

Features follow the Flutter View, ViewModel, Repository, and Service separation.

```text
lib/
  app/            application setup and routing
  core/           networking, secure storage, errors, theme
  features/
    auth/
      data/       DTOs, repositories, services
      domain/     domain models and complex use cases when needed
      presentation/ views and Riverpod view models
```

Riverpod manages dependencies and view-model state. Dio handles HTTP transport. GoRouter owns navigation. Widgets contain layout and simple display conditions, while the API remains authoritative for business rules.
