import * as assert from "assert";

import {
  readProfilesFromContents,
  resolveRegionForProfile,
} from "../../aws/profiles";

suite("AWS profile parsing", () => {
  test("merges config and credentials profiles", () => {
    const profiles = readProfilesFromContents(
      `
[default]
region = eu-west-1
[profile dev]
region = us-east-2
[sso-session shared]
sso_start_url = https://example.awsapps.com/start
      `,
      `
[default]
aws_access_key_id = abc
[ci]
aws_access_key_id = def
      `,
    );

    assert.deepStrictEqual(
      profiles.map((profile) => ({
        name: profile.name,
        defaultRegion: profile.defaultRegion,
      })),
      [
        { name: "ci", defaultRegion: undefined },
        { name: "default", defaultRegion: "eu-west-1" },
        { name: "dev", defaultRegion: "us-east-2" },
      ],
    );
  });

  test("resolves region using stored value before defaults", () => {
    const region = resolveRegionForProfile(
      { name: "dev", defaultRegion: "us-west-2" },
      "eu-central-1",
      "us-east-1",
    );

    assert.strictEqual(region, "eu-central-1");
  });
});
