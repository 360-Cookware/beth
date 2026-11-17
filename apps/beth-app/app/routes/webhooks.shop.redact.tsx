import type { ActionFunctionArgs } from 'react-router';
import { handleComplianceWebhook } from '../services/compliance.server';

export const action = (args: ActionFunctionArgs) => handleComplianceWebhook(args);
