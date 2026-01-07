---
description: Deployment SOP - tests must pass before commit/deploy
---

# Deployment Standard Operating Procedure

## Pre-Commit Checklist

Before committing any code changes:

// turbo-all
1. Run all tests:
   ```bash
   npm test
   ```
   ⚠️ **DO NOT COMMIT IF ANY TESTS FAIL**

2. Run linter:
   ```bash
   npm run lint
   ```

3. Verify build succeeds:
   ```bash
   npm run build
   ```

## Git Workflow

1. **Create feature branch:**
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Run tests before committing:**
   ```bash
   npm test && git add . && git commit -m "feat: description"
   ```

3. **Push and create PR:**
   ```bash
   git push origin feature/my-feature
   ```

## Deployment Checklist

Before deploying to production:

- [ ] All 202+ tests pass (`npm test`)
- [ ] No lint errors (`npm run lint`)
- [ ] Build succeeds (`npm run build`)
- [ ] Environment variables configured
- [ ] Database migrations applied (if any)

## Quick Commands

```bash
# Full pre-commit check
npm test && npm run lint && npm run build

# Run specific test file
npm test -- lib/api/__tests__/meetingbaas-api.test.ts

# Watch mode during development
npm run test:watch
```

## Test Coverage Requirements

| Area | Min Tests |
|------|-----------|
| Webhook Events | 66 |
| MeetingBaas API | 27 |
| Validation Utils | 47 |
| AI Generation | 22 |
| API Routes | 25 |
| Encryption | 15 |
