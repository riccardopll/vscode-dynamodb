#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { randomInt } from "node:crypto";

import {
  BatchWriteItemCommand,
  CreateTableCommand,
  DescribeTableCommand,
  ResourceNotFoundException,
  waitUntilTableExists,
} from "@aws-sdk/client-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { fromIni } from "@aws-sdk/credential-provider-ini";
import { marshall } from "@aws-sdk/util-dynamodb";

const profile = "default";
const region =
  process.env.AWS_REGION ??
  process.env.AWS_DEFAULT_REGION ??
  (await readProfileRegion(profile)) ??
  "us-east-1";

const customerTableName = "Customers";
const ordersTableName = "Orders";
const eventsTableName = "Events";

const client = new DynamoDBClient({
  region,
  credentials: fromIni({ profile }),
});

try {
  console.log(`Seeding tables in ${region} with the ${profile} profile.`);

  await ensureTable(client, {
    TableName: customerTableName,
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [{ AttributeName: "customerId", AttributeType: "S" }],
    KeySchema: [{ AttributeName: "customerId", KeyType: "HASH" }],
  });

  await ensureTable(client, {
    TableName: ordersTableName,
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [
      { AttributeName: "tenantId", AttributeType: "S" },
      { AttributeName: "orderId", AttributeType: "N" },
      { AttributeName: "customerId", AttributeType: "S" },
      { AttributeName: "createdAt", AttributeType: "N" },
    ],
    KeySchema: [
      { AttributeName: "tenantId", KeyType: "HASH" },
      { AttributeName: "orderId", KeyType: "RANGE" },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: "CustomerCreatedAtIndex",
        KeySchema: [
          { AttributeName: "customerId", KeyType: "HASH" },
          { AttributeName: "createdAt", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
      },
    ],
  });

  await ensureTable(client, {
    TableName: eventsTableName,
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [
      { AttributeName: "streamId", AttributeType: "S" },
      { AttributeName: "eventAt", AttributeType: "N" },
    ],
    KeySchema: [
      { AttributeName: "streamId", KeyType: "HASH" },
      { AttributeName: "eventAt", KeyType: "RANGE" },
    ],
  });

  const customers = buildCustomers();
  const orders = buildOrders(customers);
  const events = buildEvents(customers);

  await putItems(client, customerTableName, customers);
  await putItems(client, ordersTableName, orders);
  await putItems(client, eventsTableName, events);

  console.log("");
  console.log("Seed complete:");
  console.log(`- ${customerTableName}: ${customers.length} items`);
  console.log(`- ${ordersTableName}: ${orders.length} items`);
  console.log(`- ${eventsTableName}: ${events.length} items`);
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Failed to seed demo data.",
  );
  process.exitCode = 1;
}

async function readProfileRegion(profileName) {
  const configPath = path.join(os.homedir(), ".aws", "config");

  try {
    const content = await readFile(configPath, "utf8");
    const sections = parseIniSections(content);
    const sectionName =
      profileName === "default" ? "default" : `profile ${profileName}`;

    return sections.find((section) => section.name === sectionName)?.values
      .region;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

function parseIniSections(content) {
  const sections = [];
  let currentSection;

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) {
      continue;
    }

    if (line.startsWith("[") && line.endsWith("]")) {
      currentSection = {
        name: line.slice(1, -1).trim(),
        values: {},
      };
      sections.push(currentSection);
      continue;
    }

    if (!currentSection) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    currentSection.values[key] = value;
  }

  return sections;
}

async function ensureTable(client, input) {
  const tableName = input.TableName;

  try {
    const description = await client.send(
      new DescribeTableCommand({ TableName: tableName }),
    );

    console.log(
      `Table "${tableName}" already exists (${description.Table?.TableStatus ?? "UNKNOWN"}).`,
    );
  } catch (error) {
    if (!(error instanceof ResourceNotFoundException)) {
      throw error;
    }

    console.log(`Creating table "${tableName}"...`);
    await client.send(new CreateTableCommand(input));
  }

  await waitUntilTableExists(
    { client, maxWaitTime: 120 },
    { TableName: tableName },
  );
}

async function putItems(client, tableName, items) {
  for (let index = 0; index < items.length; index += 25) {
    const batch = items.slice(index, index + 25);

    await client.send(
      new BatchWriteItemCommand({
        RequestItems: {
          [tableName]: batch.map((item) => ({
            PutRequest: {
              Item: marshall(item, { removeUndefinedValues: true }),
            },
          })),
        },
      }),
    );
  }

  console.log(`Seeded ${items.length} items into "${tableName}".`);
}

function buildCustomers() {
  const now = Math.floor(Date.now() / 1000);
  const companies = [
    ["cust#alpine", "Alpine Robotics", "enterprise", "rome"],
    ["cust#luna", "Luna Health", "growth", "milan"],
    ["cust#atlas", "Atlas Travel", "startup", "turin"],
    ["cust#cinder", "Cinder Studio", "enterprise", "florence"],
    ["cust#harbor", "Harbor Foods", "growth", "bologna"],
    ["cust#north", "Northwind Bikes", "startup", "naples"],
  ];

  return companies.map(([customerId, name, tier, city], index) => ({
    customerId,
    name,
    email: `${customerId.slice(5)}@example.dev`,
    tier,
    city,
    isActive: index !== 2,
    createdAt: now - index * 86_400,
    healthScore: randomInt(72, 99),
    tags: shuffle(["demo", "readme", "customer", tier]).slice(0, 3),
    preferences: {
      contact: index % 2 === 0 ? "email" : "slack",
      weeklyDigest: index % 3 !== 0,
    },
  }));
}

function buildOrders(customers) {
  const statuses = ["pending", "paid", "shipped", "delivered"];
  const tenants = ["tenant#blue", "tenant#green"];
  const orders = [];
  let orderId = 1001;
  let createdAt = Math.floor(Date.now() / 1000) - 21_600;

  for (const customer of customers) {
    for (let offset = 0; offset < 3; offset += 1) {
      const quantity = randomInt(1, 5);
      const unitPrice = randomInt(20, 220);
      orders.push({
        tenantId: tenants[(orderId + offset) % tenants.length],
        orderId,
        customerId: customer.customerId,
        createdAt,
        status: statuses[(orderId + offset) % statuses.length],
        total: Number((unitPrice * quantity + randomInt(0, 40)).toFixed(2)),
        currency: "EUR",
        fulfilled: orderId % 2 === 0,
        lineItems: [
          {
            sku: `sku-${customer.customerId.slice(-4)}-${offset + 1}`,
            quantity,
            unitPrice,
          },
        ],
        shipping: {
          method: offset % 2 === 0 ? "courier" : "pickup",
          priority: customer.tier === "enterprise",
        },
      });
      orderId += 1;
      createdAt += 900;
    }
  }

  return orders;
}

function buildEvents(customers) {
  const eventTypes = ["sync.completed", "export.started", "alert.raised"];
  const severities = ["info", "warning", "critical"];
  const now = Math.floor(Date.now() / 1000) - 7_200;

  return customers.flatMap((customer, index) => [
    {
      streamId: `stream#${customer.customerId.slice(5)}`,
      eventAt: now + index * 300,
      type: eventTypes[index % eventTypes.length],
      severity: severities[index % severities.length],
      actor: index % 2 === 0 ? "system" : "operator",
      payload: {
        customerId: customer.customerId,
        retryCount: randomInt(0, 4),
        latencyMs: randomInt(120, 900),
      },
      labels: shuffle(["demo", "events", customer.city, customer.tier]).slice(
        0,
        3,
      ),
    },
    {
      streamId: `stream#${customer.customerId.slice(5)}`,
      eventAt: now + index * 300 + 60,
      type: eventTypes[(index + 1) % eventTypes.length],
      severity: severities[(index + 1) % severities.length],
      actor: index % 2 === 0 ? "scheduler" : "api",
      payload: {
        customerId: customer.customerId,
        retryCount: randomInt(0, 2),
        latencyMs: randomInt(100, 500),
      },
      labels: shuffle(["json", "nested", customer.city, "readme"]).slice(0, 3),
    },
  ]);
}

function shuffle(values) {
  const copy = [...values];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const nextIndex = randomInt(0, index + 1);
    [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
  }

  return copy;
}
