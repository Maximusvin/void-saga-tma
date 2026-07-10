import { openDatabase } from '../server/db';
import { RealmRepository, type RealmPolicyPatch } from '../server/realmRepository';

const [command, ...rawArguments] = process.argv.slice(2);

const print = (value: unknown) => {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
};

const parseBoolean = (value: string) => {
  if (value === 'true' || value === '1') {
    return true;
  }
  if (value === 'false' || value === '0') {
    return false;
  }
  throw new Error(`Expected boolean, received: ${value}`);
};

const parseInteger = (value: string) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Expected integer, received: ${value}`);
  }
  return parsed;
};

const parsePolicyPatch = (argumentsToParse: string[]) => {
  const patch: RealmPolicyPatch = {};
  for (const argument of argumentsToParse) {
    const [key, value, ...rest] = argument.split('=');
    if (!key || value === undefined || rest.length > 0) {
      throw new Error(`Policy arguments must use key=value: ${argument}`);
    }
    if (key === 'autoLaunchEnabled' || key === 'autoMergeEnabled') {
      patch[key] = parseBoolean(value);
      continue;
    }
    if (
      key === 'hardCapacity' ||
      key === 'launchIntervalHours' ||
      key === 'mergeBatchSize' ||
      key === 'minimumOpenHours' ||
      key === 'softCapacity'
    ) {
      patch[key] = parseInteger(value);
      continue;
    }
    throw new Error(`Unknown policy field: ${key}`);
  }
  return patch;
};

const database = openDatabase();

try {
  const realms = new RealmRepository(database);
  if (command === 'list') {
    print({ policy: realms.getPolicy(), realms: realms.listAdminRealms() });
  } else if (command === 'create') {
    print(realms.createRealm('manual_cli', rawArguments[0] ?? 'manual'));
  } else if (command === 'merge-next') {
    print({ mergedRealm: realms.mergeNext('manual_cli') });
  } else if (command === 'reconcile') {
    print(realms.reconcile('scheduler'));
  } else if (command === 'policy') {
    print(realms.updatePolicy(parsePolicyPatch(rawArguments)));
  } else {
    process.stderr.write(
      'Usage: realm-admin <list|create [reason]|merge-next|reconcile|policy key=value...>\n',
    );
    process.exitCode = 2;
  }
} finally {
  database.close();
}
