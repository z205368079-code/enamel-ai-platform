import 'dotenv/config';

import { createApp } from './app.js';
import { getGatewayPort } from './config/env.js';

const port = getGatewayPort();
const app = createApp();

app.listen(port, '0.0.0.0', () => {
  console.log(`Enamel AI Gateway listening on port ${port}.`);
});
