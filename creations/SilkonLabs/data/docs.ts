export interface DocsSection {
  id: string;
  title: string;
  href: string;
}

export interface APIEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  description: string;
  parameters: { name: string; type: string; required: boolean; description: string }[];
  responses: { code: string; description: string }[];
  exampleRequest: string;
  exampleResponse: string;
}

export const docsNav: DocsSection[] = [
  { id: 'getting-started', title: 'Getting Started', href: '/docs' },
  { id: 'models', title: 'Models', href: '/docs/models' },
  { id: 'authentication', title: 'Authentication', href: '/docs/authentication' },
  { id: 'rate-limits', title: 'Rate Limits', href: '/docs/rate-limits' },
  { id: 'errors', title: 'Error Handling', href: '/docs/errors' },
  { id: 'api', title: 'API Reference', href: '/docs/api' },
  { id: 'python', title: 'Python SDK', href: '/docs/python' },
  { id: 'javascript', title: 'JavaScript SDK', href: '/docs/javascript' },
];

export const endpoints: APIEndpoint[] = [
  {
    method: 'POST',
    path: '/v1/completions',
    description: 'Generate a text completion from a Silkon model.',
    parameters: [
      { name: 'model', type: 'string', required: true, description: 'The model to use (e.g. silkon-1t).' },
      { name: 'prompt', type: 'string', required: true, description: 'The prompt to generate a completion for.' },
      { name: 'max_tokens', type: 'integer', required: false, description: 'Max tokens to generate. Default: 1024.' },
      { name: 'temperature', type: 'number', required: false, description: 'Sampling temperature. Default: 0.7.' },
      { name: 'stream', type: 'boolean', required: false, description: 'Whether to stream the response. Default: false.' },
    ],
    responses: [
      { code: '200', description: 'Successful completion' },
      { code: '400', description: 'Invalid request' },
      { code: '401', description: 'Unauthorized' },
      { code: '429', description: 'Rate limit exceeded' },
    ],
    exampleRequest: 'curl -X POST https://api.silkonlabs.com/v1/completions \\\n  -H "Authorization: Bearer $SILKON_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{\n    "model": "silkon-1t",\n    "prompt": "Explain quantum computing in simple terms.",\n    "max_tokens": 512,\n    "temperature": 0.7\n  }\'',
    exampleResponse: `{
  "id": "cmpl_abc123",
  "object": "text_completion",
  "model": "silkon-1t",
  "created": 1737397200,
  "choices": [{
    "text": "Quantum computing uses qubits...",
    "index": 0,
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 8,
    "completion_tokens": 32,
    "total_tokens": 40
  }
}`,
  },
  {
    method: 'POST',
    path: '/v1/chat/completions',
    description: 'Generate a multi-turn chat completion.',
    parameters: [
      { name: 'model', type: 'string', required: true, description: 'Model to use.' },
      { name: 'messages', type: 'array', required: true, description: 'Conversation messages.' },
      { name: 'temperature', type: 'number', required: false, description: 'Sampling temperature.' },
      { name: 'top_p', type: 'number', required: false, description: 'Nucleus sampling parameter.' },
    ],
    responses: [
      { code: '200', description: 'Successful completion' },
      { code: '400', description: 'Invalid request' },
      { code: '401', description: 'Unauthorized' },
    ],
    exampleRequest: 'curl -X POST https://api.silkonlabs.com/v1/chat/completions \\\n  -H "Authorization: Bearer $SILKON_API_KEY" \\\n  -d \'{\n    "model": "silkon-1t",\n    "messages": [\n      {"role": "user", "content": "Hello!"}\n    ]\n  }\'',
    exampleResponse: `{
  "id": "chatcmpl_xyz789",
  "object": "chat.completion",
  "model": "silkon-1t",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "Hello! How can I help you today?"
    },
    "finish_reason": "stop"
  }],
  "usage": { "prompt_tokens": 5, "completion_tokens": 9, "total_tokens": 14 }
}`,
  },
  {
    method: 'GET',
    path: '/v1/models',
    description: 'List available models.',
    parameters: [],
    responses: [
      { code: '200', description: 'List of models' },
      { code: '401', description: 'Unauthorized' },
    ],
    exampleRequest: 'curl https://api.silkonlabs.com/v1/models \\\n  -H "Authorization: Bearer $SILKON_API_KEY"',
    exampleResponse: `{
  "data": [
    { "id": "silkon-1t", "object": "model", "created": 1737300000, "owned_by": "silkon" },
    { "id": "silkon-7b", "object": "model", "created": 1737200000, "owned_by": "silkon" }
  ]
}`,
  },
];