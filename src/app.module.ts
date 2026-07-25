import { McpApp, Module, ConfigModule, OAuthModule } from '@nitrostack/core';
import { VisaModule } from './modules/visa/visa.module.js';
import { CaseModule } from './modules/case/case.module.js';
import { OnboardingModule } from './modules/onboarding/onboarding.module.js';
import { RequirementModule } from './modules/requirement/requirement.module.js';
import { SystemHealthCheck } from './health/system.health.js';

/**
 * Root Application Module
 *
 * This is the main module that bootstraps the MCP server.
 * It registers all feature modules and health checks.
 *
 * OAuth 2.1 Authentication:
 * - Configured with Auth0 as the authorization server
 * - Supports read, write, and admin scopes
 * - Validates tokens with audience binding (RFC 8707)
 *
 * Visa Agent:
 * - VisaModule: migrated from the NitroStack Flight Booking OAuth
 *   template (pathway search, legacy case/appointment/withdrawal tools).
 *   TODO(visa-agent): this is a terminology migration only, not a real
 *   implementation of any docs/MODULES.md module.
 * - CaseModule: first real vertical slice of the Visa Case Module
 *   (docs/MODULES.md §3.1) — case_start and case_get, in-memory only.
 *   TODO(visa-case): see case.service.ts and case.tools.ts for the list of
 *   still-missing capabilities (persistence, audit, events, approvals).
 * - OnboardingModule: second vertical slice — deterministic (no LLM),
 *   regex/heuristic extraction of nationality, destinationCountry, and
 *   visaType from a free-form message, then case_start via VisaCaseService
 *   (injected from CaseModule, not called over HTTP or tool-to-tool).
 *   TODO(onboarding): see onboarding.module.ts for scope and future
 *   LLM-integration TODOs.
 * - RequirementModule: third vertical slice — deterministic visa
 *   requirement resolution (documents/timeline/steps/notes) from a small
 *   hardcoded in-memory dataset, keyed on a case's nationality,
 *   destinationCountry, and visaType. Retrieves the case via
 *   VisaCaseService (injected from CaseModule) and caches the result
 *   in-memory for `case://requirements/{caseId}` to read back.
 *   TODO(requirement): see requirement.module.ts for scope and the future
 *   Policy Knowledge Module TODOs.
 * See docs/ARCHITECTURE.md and docs/MODULES.md for the full target Visa
 * Agent module set (Case, Client, Operations, Documents, Policy Knowledge,
 * Broker, Task, Approval, Notification, Audit).
 */
@McpApp({
  module: AppModule,
  server: {
    name: 'visa-agent-server',
    version: '1.0.0'
  },
  logging: {
    level: 'info'
  }
})
@Module({
  name: 'app',
  description: 'Visa Agent MCP server with OAuth 2.1 authentication (migrated from the NitroStack Flight Booking OAuth template)',
  imports: [
    ConfigModule.forRoot(),

    // Enable OAuth 2.1 authentication
    OAuthModule.forRoot({
      // Whether OAuth is enforced. Defaults to false (dev-friendly): the server
      // runs out-of-the-box and protected endpoints are reachable without a token.
      // Set OAUTH_REQUIRED=true to enforce auth (fail-closed). When enforced but no
      // verifier (JWKS_URI / INTROSPECTION_ENDPOINT) is configured, the server still
      // starts and warns, but rejects protected requests until one is configured.
      required: process.env.OAUTH_REQUIRED === 'true',

      // Resource URI - YOUR MCP server's public URL
      // This is used for token audience binding (RFC 8707)
      // CRITICAL: Tokens must be issued specifically for this URI
      resourceUri: process.env.RESOURCE_URI || 'https://mcplocal',

      // Authorization Server(s) - The OAuth provider URL(s)
      // Supports multiple auth servers for federation scenarios
      authorizationServers: [
        process.env.AUTH_SERVER_URL || 'https://dev-5dt0utuk31h13tjm.us.auth0.com',
      ],

      // Supported scopes for this MCP server
      // Define what permissions your server supports
      scopesSupported: [
        'read',        // Read access to resources
        'write',       // Write/modify resources
        'admin',       // Administrative operations
      ],

      // Token Introspection (RFC 7662) - For opaque tokens
      // If your OAuth provider issues opaque tokens (not JWTs),
      // you MUST configure introspection to validate them
      tokenIntrospectionEndpoint: process.env.INTROSPECTION_ENDPOINT,
      tokenIntrospectionClientId: process.env.INTROSPECTION_CLIENT_ID,
      tokenIntrospectionClientSecret: process.env.INTROSPECTION_CLIENT_SECRET,

      // Expected audience (defaults to resourceUri if not provided)
      // MUST match the audience claim in tokens (RFC 8707)
      audience: process.env.TOKEN_AUDIENCE,

      // Expected issuer (optional but recommended)
      // If provided, tokens must be from this issuer
      issuer: process.env.TOKEN_ISSUER,

      // Custom validation (optional)
      // Add any additional validation logic beyond spec requirements
      customValidation: async (tokenPayload) => {
        // Example: Check if user is active in your database
        // const user = await db.users.findOne({ id: tokenPayload.sub });
        // return user?.active === true;

        // For now, accept all valid tokens
        return true;
      },
    }),

    VisaModule,
    CaseModule,
    OnboardingModule,
    RequirementModule
  ],
  providers: [
    // Health Checks
    SystemHealthCheck,
  ]
})
export class AppModule { }
