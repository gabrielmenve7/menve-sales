import * as crypto from "crypto";
import { verifyMetaHubSignature256 } from "./meta-signature";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const secret = "test-app-secret";
const body = Buffer.from('{"object":"whatsapp_business_account"}', "utf8");
const sig =
  "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");

assert(verifyMetaHubSignature256(body, sig, secret), "valid sig should pass");
assert(
  !verifyMetaHubSignature256(body, "sha256=deadbeef", secret),
  "wrong sig should fail",
);
assert(
  !verifyMetaHubSignature256(Buffer.from("x"), sig, secret),
  "wrong body should fail",
);

// eslint-disable-next-line no-console
console.log("meta-signature.selftest: ok");
