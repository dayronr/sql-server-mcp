// src/filesystem/uri-parser.ts

import { VirtualPath } from '../types/index.js';

export function parseVirtualUri(uri: string, virtualRoot: string): VirtualPath {
  // Remove virtual root prefix
  const relativePath = uri.startsWith(virtualRoot)
    ? uri.substring(virtualRoot.length)
    : uri;

  const parts = relativePath.split('/').filter(p => p);

  if (parts.length === 0) {
    throw new Error('Invalid URI: empty path');
  }

  // Determine type from first path segment
  const typeMap: Record<string, VirtualPath['type']> = {
    'stored_procedures': 'stored-procedure',
    'views': 'view',
    'functions': 'function',
    'tables': 'table'
  };

  const type = typeMap[parts[0]];
  if (!type) {
    throw new Error(`Unknown object type: ${parts[0]}`);
  }

  // Parse schema and name
  let schema = 'dbo';
  let name = '';

  if (parts.length >= 2) {
    schema = parts[1];
  }

  if (parts.length >= 3) {
    // Remove .sql extension if present
    name = parts[2].replace(/\.sql$/, '');
  }

  return {
    type,
    schema,
    name,
    fullPath: uri
  };
}

export function buildVirtualUri(virtualRoot: string, type: VirtualPath['type'], schema: string, name: string): string {
  const typeDir = type === 'stored-procedure' ? 'stored_procedures' :
                  type === 'view' ? 'views' :
                  type === 'function' ? 'functions' : 'tables';

  return `${virtualRoot}/${typeDir}/${schema}/${name}.sql`;
}
