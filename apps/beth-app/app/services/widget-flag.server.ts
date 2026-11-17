import db from '../db.server';
import { adminQuery, type AdminClient } from './shopify/admin-graphql.server';

const APP_INSTALLATION_QUERY = `#graphql
query BethAppInstallation { currentAppInstallation { id } }`;

const SET_FLAG_MUTATION = `#graphql
mutation BethWidgetFlag($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) { userErrors { field message } }
}`;

/**
 * Turns the storefront launcher on or off. The theme app extension reads the app-owned
 * metafield app.metafields.beth.widget_enabled (on the app installation, writable only by Beth),
 * and the chat endpoint checks Settings.widgetEnabled.
 */
export async function setWidgetEnabled(shop: string, admin: AdminClient, enabled: boolean): Promise<void> {
  const { currentAppInstallation } = await adminQuery<{ currentAppInstallation: { id: string } }>(
    admin,
    APP_INSTALLATION_QUERY,
  );
  const result = await adminQuery<{
    metafieldsSet: { userErrors: { field: string[] | null; message: string }[] };
  }>(admin, SET_FLAG_MUTATION, {
    metafields: [
      {
        ownerId: currentAppInstallation.id,
        namespace: 'beth',
        key: 'widget_enabled',
        type: 'boolean',
        value: enabled ? 'true' : 'false',
      },
    ],
  });
  if (result.metafieldsSet.userErrors.length) {
    throw new Error(result.metafieldsSet.userErrors.map((e) => e.message).join('; '));
  }
  await db.settings.upsert({
    where: { shop },
    create: { shop, widgetEnabled: enabled },
    update: { widgetEnabled: enabled },
  });
}
