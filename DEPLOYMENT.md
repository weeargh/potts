# Deployment Guide

Deploy your Meeting Bot MVP to production in minutes.

## Vercel (Recommended)

### Prerequisites
- GitHub, GitLab, or Bitbucket account
- Vercel account ([vercel.com](https://vercel.com))

### Steps

1. **Push Code to Git Repository**

```bash
cd /Users/suwandi/potts/potts-app
git init
git add .
git commit -m "Initial commit: Meeting Bot MVP"
git remote add origin <your-repo-url>
git push -u origin main
```

2. **Import Project to Vercel**

- Go to [vercel.com/new](https://vercel.com/new)
- Import your Git repository
- Vercel will auto-detect Next.js configuration

3. **Configure Environment Variables**

In Vercel project settings, add:

```
MEETINGBAAS_API_KEY=your_meetingbaas_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
NEXT_PUBLIC_BASE_URL=https://your-app.vercel.app
```

4. **Deploy**

- Click "Deploy"
- Wait 2-3 minutes for build to complete
- Your app is live!

### Automatic Deployments

- Every push to `main` triggers a new deployment
- Pull requests get preview deployments
- Rollback to previous deployments with one click

## Netlify

### Steps

1. **Push Code to Git Repository** (same as above)

2. **Import to Netlify**

- Go to [app.netlify.com/start](https://app.netlify.com/start)
- Connect your Git repository
- Configure build settings:
  - Build command: `npm run build`
  - Publish directory: `.next`

3. **Environment Variables**

Add the same environment variables as Vercel.

4. **Deploy**

- Click "Deploy site"
- Wait for build to complete

## Docker

### Dockerfile

Create a `Dockerfile` in your project root:

```dockerfile
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED 1

RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

USER nextjs

EXPOSE 3000

ENV PORT 3000

CMD ["npm", "start"]
```

### Build and Run

```bash
docker build -t meeting-bot .
docker run -p 3000:3000 \
  -e MEETINGBAAS_API_KEY=your_key \
  -e ANTHROPIC_API_KEY=your_key \
  meeting-bot
```

## Custom Server (VPS, AWS, GCP, Azure)

### Prerequisites
- Node.js 18+ installed on server
- PM2 or similar process manager
- Nginx for reverse proxy (optional)

### Steps

1. **Build Locally**

```bash
npm run build
```

2. **Upload Files to Server**

Upload these directories/files:
- `.next/`
- `node_modules/`
- `public/`
- `package.json`
- `.env`

3. **Install PM2**

```bash
npm install -g pm2
```

4. **Start Application**

```bash
pm2 start npm --name "meeting-bot" -- start
pm2 save
pm2 startup
```

5. **Configure Nginx** (Optional)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Environment Variables

### Required

```bash
MEETINGBAAS_API_KEY=your_meetingbaas_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
```

### Optional

```bash
NEXT_PUBLIC_BASE_URL=https://your-app.com  # For absolute URLs
NODE_ENV=production                         # Production mode
```

## Post-Deployment Checklist

- [ ] Environment variables configured
- [ ] App accessible via HTTPS
- [ ] API routes responding correctly
- [ ] Create test meeting bot
- [ ] Verify transcript generation
- [ ] Check AI summary generation
- [ ] Test on mobile devices
- [ ] Configure custom domain (optional)
- [ ] Set up monitoring (optional)
- [ ] Enable error tracking (optional)

## Monitoring (Optional)

### Vercel Analytics

```bash
npm install @vercel/analytics
```

Add to `app/layout.tsx`:

```typescript
import { Analytics } from '@vercel/analytics/react'

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
```

### Sentry Error Tracking

```bash
npm install @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

## Performance Optimization

1. **Enable Image Optimization**

Next.js automatically optimizes images. Use the `<Image>` component.

2. **Enable Caching**

Add caching headers in `next.config.ts`:

```typescript
async headers() {
  return [
    {
      source: '/api/:path*',
      headers: [
        { key: 'Cache-Control', value: 'no-store' }
      ],
    },
  ]
}
```

3. **Enable Compression**

Vercel and Netlify enable compression by default.

For custom servers, enable gzip in Nginx:

```nginx
gzip on;
gzip_types text/plain text/css application/json application/javascript;
```

## Security

1. **Environment Variables**

Never commit `.env` to Git. Use `.env.example` as template.

2. **API Keys**

Rotate API keys regularly. Use different keys for development and production.

3. **HTTPS**

Always use HTTPS in production. Vercel and Netlify provide free SSL.

4. **Rate Limiting**

Consider adding rate limiting to API routes:

```bash
npm install express-rate-limit
```

## Scaling

### Horizontal Scaling

- Vercel: Automatic with Edge Functions
- AWS: Use ECS or Lambda
- Docker: Use Kubernetes or Docker Swarm

### Database (When Needed)

When you outgrow in-memory storage:
- PostgreSQL (Vercel Postgres, Supabase)
- MongoDB (MongoDB Atlas)
- Redis (Upstash, Redis Cloud)

## Cost Estimation

### Vercel (Hobby Plan)
- Free for personal projects
- Unlimited bandwidth
- Automatic HTTPS
- Built-in analytics

### Vercel (Pro Plan - $20/month)
- For commercial use
- Advanced analytics
- More concurrent builds
- Priority support

### Custom Server
- VPS: $5-50/month (DigitalOcean, Linode)
- AWS EC2: $10-100/month (t3.small - t3.large)
- Domain: $10-15/year

## Troubleshooting

### Build Fails

Check:
- Node.js version (18+)
- All dependencies installed
- TypeScript errors resolved
- Environment variables set

### API Routes Not Working

Check:
- API keys are correct
- Network connectivity
- CORS settings (if applicable)
- Server logs for errors

### Performance Issues

- Enable caching
- Optimize images
- Use CDN for static assets
- Consider database for large datasets

## Support

- Next.js: [nextjs.org/docs](https://nextjs.org/docs)
- Vercel: [vercel.com/docs](https://vercel.com/docs)
- MeetingBaas: [docs.meetingbaas.com](https://docs.meetingbaas.com)
- Anthropic: [docs.anthropic.com](https://docs.anthropic.com)

---

**Ready to deploy? Choose your platform and follow the steps above!**
