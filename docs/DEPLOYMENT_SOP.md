# Deployment SOP

## Quick Reference

**Before EVERY commit:**
```bash
npm test && npm run lint
```

**Before deployment:**
```bash
npm test && npm run lint && npm run build
```

---

## Pre-Commit Checklist

| Step | Command | Required |
|------|---------|----------|
| 1. Run tests | `npm test` | ✅ All 202 must pass |
| 2. Run linter | `npm run lint` | ✅ No errors |
| 3. Build check | `npm run build` | ⚠️ For deployment only |

---

## Git Workflow

### Feature Development
```bash
# Create branch
git checkout -b feature/my-feature

# Make changes, then...
npm test                    # Verify tests pass
git add .
git commit -m "feat: ..."   # Only if tests pass
git push origin feature/my-feature
```

### Hotfix
```bash
git checkout -b hotfix/issue-123
# Fix issue
npm test                    # MUST pass
git add . && git commit -m "fix: ..."
git push origin hotfix/issue-123
```

---

## Deployment Checklist

- [ ] All tests pass: `npm test` (202+ tests)
- [ ] No lint errors: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] Env vars set (Vercel dashboard)
- [ ] Database up (Supabase)

---

## Test Categories (Reference)

| Category | Tests | Purpose |
|----------|-------|---------|
| Webhook Contracts | 66 | Prevent API breakage |
| MeetingBaas Utils | 47 | Validation logic |
| MeetingBaas API | 27 | API integration |
| AI Generation | 22 | Summary/transcript |
| API Routes | 25 | Endpoint logic |
| Encryption | 15 | Security |

---

## Rollback Procedure

If deployment fails:
```bash
# Vercel - instant rollback via dashboard
# Or redeploy previous commit:
git revert HEAD
npm test && git push
```
