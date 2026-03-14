import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { fromIni } from "@aws-sdk/credential-provider-ini";

import type { ConnectionSelection } from "../types";

export function createDynamoDbClient(
  connection: ConnectionSelection,
): DynamoDBClient {
  return new DynamoDBClient({
    region: connection.region,
    credentials: fromIni({
      profile: connection.profile,
    }),
  });
}
