#!/usr/bin/env node
// Entry lakar-mcp (stdio). Didaftarkan lewat .mcp.json project; LAKAR_URL menunjuk ke lakard.
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { DEFAULT_LAKARD_URL } from '@lakar/schema';
import { createLakarMcpServer } from './server.js';

const url = process.env.LAKAR_URL || DEFAULT_LAKARD_URL;
const server = createLakarMcpServer(url);
await server.connect(new StdioServerTransport());
