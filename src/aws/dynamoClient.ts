import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { fromIni } from "@aws-sdk/credential-provider-ini";

import type { ConnectionSelection } from "../types";
import { AWS_CONFIG_PATH, AWS_CREDENTIALS_PATH } from "./profiles";

export function createDynamoDbClient(
  connection: ConnectionSelection,
): DynamoDBClient {
  return new DynamoDBClient({
    region: connection.region,
    credentials: fromIni({
      configFilepath: AWS_CONFIG_PATH,
      filepath: AWS_CREDENTIALS_PATH,
      ignoreCache: true,
      profile: connection.profile,
    }),
  });
}
