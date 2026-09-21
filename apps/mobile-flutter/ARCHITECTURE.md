# Flutter architecture

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
