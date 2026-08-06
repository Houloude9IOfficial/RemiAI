# Silkon Labs - Next.js App

## Building

```bash
npm run build
```

## Running in production

```bash
npm start
```

## Docker (optional)

```bash
docker build -t silkon-labs .
docker run -p 3000:3000 silkon-labs
```

## Vercel Deployment

The app is configured for Vercel deployment. Simply:

1. Push to GitHub
2. Import in Vercel dashboard
3. Add environment variables from `.env.example`
4. Deploy

No Dockerfile needed - Vercel handles Next.js natively.

## Environment Variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

Required for production waitlist functionality:
- `WAITLIST_API_ENDPOINT` - Your backend API
- `WAITLIST_API_SECRET` - Secret key for validation