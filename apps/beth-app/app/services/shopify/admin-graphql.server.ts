import type { AdminApiContext } from '@shopify/shopify-app-react-router/server';

/** The part of the Admin API context the services need (easy to fake in tests). */
export type AdminClient = Pick<AdminApiContext, 'graphql'>;

export class AdminGraphqlError extends Error {
  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AdminGraphqlError';
  }
}

/**
 * Runs an Admin GraphQL operation and returns `data`. The client retries throttled and
 * network failures (`tries`) and throws on GraphQL errors; both surface as AdminGraphqlError.
 */
export async function adminQuery<T>(
  admin: AdminClient,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  let body: { data?: T; errors?: unknown };
  try {
    const response = await admin.graphql(query, { variables, tries: 3 });
    body = (await response.json()) as { data?: T; errors?: unknown };
  } catch (error) {
    throw new AdminGraphqlError(
      `Admin API request failed: ${error instanceof Error ? error.message : String(error)}`,
      error,
    );
  }
  if (body.errors) throw new AdminGraphqlError('Admin API returned errors', body.errors);
  if (!body.data) throw new AdminGraphqlError('Admin API returned no data');
  return body.data;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
