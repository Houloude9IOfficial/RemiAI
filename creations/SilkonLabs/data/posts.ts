export interface Post {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  author: {
    name: string;
    role: string;
    avatar: string;
  };
  date: string;
  tags: string[];
  readingTime: string;
  featured: boolean;
  type: 'blog' | 'research';
}

export const posts: Post[] = [
  {
    slug: 'silkon-1t-technical-report',
    title: 'Silkon 1T: Technical Report',
    excerpt: 'A comprehensive deep-dive into the architecture, training methodology, and evaluation of our 1 trillion parameter flagship model.',
    content: '...',
    author: { name: 'Dr. Jonas Müller', role: 'Head of Research', avatar: 'JM' },
    date: '2026-01-20',
    tags: ['Research', 'Model Release', 'Technical Report'],
    readingTime: '25 min',
    featured: true,
    type: 'research',
  },
  {
    slug: 'scaling-laws-revisited',
    title: 'Scaling Laws Revisited: Beyond Chinchilla',
    excerpt: 'Our empirical findings on optimal compute allocation for dense transformers at the 1T parameter scale.',
    content: '...',
    author: { name: 'Dr. Maya Patel', role: 'Chief Technology Officer', avatar: 'MP' },
    date: '2026-01-15',
    tags: ['Research', 'Scaling Laws', 'Training'],
    readingTime: '18 min',
    featured: false,
    type: 'research',
  },
  {
    slug: 'multilingual-evaluation',
    title: 'Evaluating Multilingual Capabilities at Scale',
    excerpt: 'How Silkon 1T performs across 100+ languages — methodology, benchmarks, and surprising findings.',
    content: '...',
    author: { name: 'Dr. Alex Chen', role: 'CEO', avatar: 'AC' },
    date: '2026-01-10',
    tags: ['Research', 'Multilingual', 'Evaluation'],
    readingTime: '12 min',
    featured: false,
    type: 'research',
  },
  {
    slug: 'introducing-silkon-7b',
    title: 'Introducing Silkon 7B: Efficient Frontier',
    excerpt: 'Our compact 7B model delivers 90% of Silkon 1T performance at 1/140th the parameters. Here is how we did it.',
    content: '...',
    author: { name: 'Sarah Kim', role: 'Head of Engineering', avatar: 'SK' },
    date: '2026-01-05',
    tags: ['Model Release', 'Engineering', 'Open Weights'],
    readingTime: '10 min',
    featured: true,
    type: 'blog',
  },
  {
    slug: 'building-developer-platform',
    title: 'Building a Developer Platform for 1T Models',
    excerpt: 'Lessons learned designing APIs, SDKs, and playgrounds for frontier models at enterprise scale.',
    content: '...',
    author: { name: 'Maria Santos', role: 'Platform Lead', avatar: 'MS' },
    date: '2026-01-02',
    tags: ['Engineering', 'API', 'Platform'],
    readingTime: '8 min',
    featured: false,
    type: 'blog',
  },
  {
    slug: 'responsible-ai-development',
    title: 'Our Approach to Responsible AI Development',
    excerpt: 'Safety evaluations, red-teaming, bias audits, and deployment guardrails — how we build responsibly.',
    content: '...',
    author: { name: 'Dr. Priya Sharma', role: 'AI Safety Lead', avatar: 'PS' },
    date: '2025-12-28',
    tags: ['Safety', 'Ethics', 'Governance'],
    readingTime: '15 min',
    featured: false,
    type: 'blog',
  },
];

export const allTags = Array.from(new Set(posts.flatMap(p => p.tags))).sort();

export function getPostsByType(type: 'blog' | 'research') {
  return posts.filter(p => p.type === type).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getPostBySlug(slug: string) {
  return posts.find(p => p.slug === slug);
}

export function getFeaturedPosts(type?: 'blog' | 'research') {
  return posts.filter(p => p.featured && (!type || p.type === type));
}