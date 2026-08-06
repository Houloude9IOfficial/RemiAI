export interface Job {
  id: string;
  title: string;
  department: 'Engineering' | 'Research' | 'Product' | 'Operations' | 'Design';
  location: string;
  type: 'Full-time' | 'Contract' | 'Internship';
  description: string;
  requirements: string[];
  responsibilities: string[];
  postedDate: string;
  featured: boolean;
}

export const jobs: Job[] = [
  {
    id: 'senior-ml-engineer',
    title: 'Senior ML Engineer',
    department: 'Engineering',
    location: 'San Francisco / Remote',
    type: 'Full-time',
    description: 'Build and scale the training and inference infrastructure for Silkon 1T and future models. You\'ll work on distributed training, model optimization, and serving at scale.',
    requirements: [
      '5+ years ML infrastructure experience',
      'Expert in PyTorch, JAX, or TensorFlow',
      'Strong distributed systems background',
      'Experience with 100B+ parameter models',
      'CUDA/Triton optimization experience',
    ],
    responsibilities: [
      'Design and maintain training clusters (1000+ GPUs)',
      'Optimize model throughput and latency',
      'Build evaluation and benchmarking pipelines',
      'Collaborate with research on model architecture',
    ],
    postedDate: '2026-01-15',
    featured: true,
  },
  {
    id: 'research-scientist',
    title: 'Research Scientist - Language Models',
    department: 'Research',
    location: 'London / Remote',
    type: 'Full-time',
    description: 'Advance the state of the art in large language model training, alignment, and reasoning. Publish at top venues and open-source key findings.',
    requirements: [
      'PhD in ML/CS or equivalent experience',
      'Publications at NeurIPS, ICML, ICLR',
      'Deep understanding of transformer architectures',
      'Experience with RLHF/RLAIF',
      'Strong empirical research skills',
    ],
    responsibilities: [
      'Design and run large-scale experiments',
      'Improve model reasoning and alignment',
      'Develop novel training objectives',
      'Publish and present research',
    ],
    postedDate: '2026-01-10',
    featured: true,
  },
  {
    id: 'platform-engineer',
    title: 'Platform Engineer',
    department: 'Engineering',
    location: 'New York / Remote',
    type: 'Full-time',
    description: 'Build the developer platform for Silkon models — APIs, SDKs, playground, and enterprise features.',
    requirements: [
      '5+ years backend/platform experience',
      'Go, Rust, or TypeScript expertise',
      'Kubernetes and cloud-native experience',
      'API design and developer experience',
      'Observability and reliability focus',
    ],
    responsibilities: [
      'Build and operate model serving APIs',
      'Develop SDKs for multiple languages',
      'Implement rate limiting, auth, billing',
      'Ensure 99.99% uptime',
    ],
    postedDate: '2026-01-08',
    featured: false,
  },
  {
    id: 'product-designer',
    title: 'Product Designer',
    department: 'Design',
    location: 'Remote (US/EU)',
    type: 'Full-time',
    description: 'Design intuitive interfaces for researchers, developers, and enterprise customers interacting with Silkon models.',
    requirements: [
      '5+ years product design experience',
      'Strong portfolio with dev tools/API products',
      'Figma expertise, design systems',
      'Experience with technical audiences',
      'Prototyping and user research skills',
    ],
    responsibilities: [
      'Design API documentation and playground',
      'Create enterprise dashboard UX',
      'Build and maintain design system',
      'Conduct user research with developers',
    ],
    postedDate: '2026-01-05',
    featured: false,
  },
  {
    id: 'research-intern',
    title: 'Research Intern - Summer 2026',
    department: 'Research',
    location: 'San Francisco',
    type: 'Internship',
    description: 'Work on a focused research project under the guidance of our research leads. Publish results and contribute to Silkon models.',
    requirements: [
      'PhD student in ML/CS (or graduating MS)',
      'Strong publication record or project portfolio',
      'Transformers, RL, or scaling laws experience',
      'Available full-time Summer 2026',
    ],
    responsibilities: [
      'Execute a defined research project',
      'Write and submit a paper',
      'Present findings to the team',
      'Potential for return offer',
    ],
    postedDate: '2026-01-03',
    featured: false,
  },
];

export const departments = ['Engineering', 'Research', 'Product', 'Operations', 'Design'] as const;
export const locations = ['San Francisco', 'New York', 'London', 'Remote (US)', 'Remote (EU)'] as const;
export const types = ['Full-time', 'Contract', 'Internship'] as const;