import assert from "node:assert/strict";

function isValidMeetLink(link: string): boolean {
  return link.trim().toLowerCase().includes("meet.google.com");
}

function testMeetLinkValidation() {
  assert.equal(isValidMeetLink("https://meet.google.com/abc-defg-hij"), true);
  assert.equal(isValidMeetLink("https://calendar.google.com/event"), false);
  assert.equal(isValidMeetLink(""), false);
}

testMeetLinkValidation();
console.log("deal-pipeline-promotion.selftest.ts: ok");
