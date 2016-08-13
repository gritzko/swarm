# Codebase policies

1.  the code is split into packages based on deployment options;
    if parts A can be deployed without part B, they should be
    separate packages
2.  all code is pure ES6, JSDoc comments are welcome
3.  for in-progress packages, the README.md should contain a check
    list for features done/outstanding
4.  RADME.md should avoid giving code examples bigger than one-liners;
    instead, give links to well-commented unit tests that give
    extensive API usage examples
5.  minimize external smallpox dependencies, esp. recursive dep trees