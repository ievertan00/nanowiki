```markdown
# nanowiki Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches you the core development patterns and conventions used in the `nanowiki` TypeScript codebase. You'll learn how to structure files, write code, follow commit message conventions, and run tests in a way that's consistent with the repository's established practices.

## Coding Conventions

### File Naming
- Use **PascalCase** for all file names.
  - Example: `NanoWikiCore.ts`, `PageManager.ts`

### Import Style
- Use **relative imports** for module references.
  - Example:
    ```typescript
    import { PageManager } from './PageManager';
    ```

### Export Style
- Use **named exports** for all modules.
  - Example:
    ```typescript
    export function createPage() { ... }
    export const PAGE_LIMIT = 100;
    ```

### Commit Messages
- Follow the **Conventional Commits** standard.
- Use the `feat` prefix for new features.
  - Example:
    ```
    feat: add support for page versioning
    ```

## Workflows

### Feature Development
**Trigger:** When adding a new feature to the codebase  
**Command:** `/feature-development`

1. Create a new TypeScript file using PascalCase.
2. Implement the feature using named exports.
3. Use relative imports to reference other modules.
4. Write or update tests in a corresponding `*.test.*` file.
5. Commit your changes using a conventional commit message with the `feat` prefix.
   - Example: `feat: implement page linking functionality`

### Running Tests
**Trigger:** When you want to verify your code changes  
**Command:** `/run-tests`

1. Locate or create test files matching the pattern `*.test.*`.
2. Use the project's preferred test runner (framework not specified; check project documentation or scripts).
3. Run the test command (e.g., `npm test` or similar).
4. Review test output and fix any failing tests.

## Testing Patterns

- Test files follow the `*.test.*` naming convention.
  - Example: `PageManager.test.ts`
- The specific testing framework is not detected; refer to project scripts or documentation for details.
- Place tests alongside or near the modules they cover.

## Commands
| Command              | Purpose                                      |
|----------------------|----------------------------------------------|
| /feature-development | Start a new feature following conventions    |
| /run-tests           | Run all tests in the codebase                |
```