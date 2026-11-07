import { describe, expect, it } from "vitest";

import { isPreviewHost, outboundUrl } from "./outbound";

const job = {
  url: "https://work.mercor.com/jobs/list_AAA",
  external_id: "list_AAA",
  referral_url_template: null,
};

describe("outboundUrl", () => {
  it("uses the job's own link when the platform has no referral link", () => {
    expect(outboundUrl(job)).toEqual({
      url: "https://work.mercor.com/jobs/list_AAA",
      referral: false,
    });
  });

  it("fills the job id into the referral link", () => {
    expect(
      outboundUrl({
        ...job,
        referral_url_template:
          "https://work.mercor.com/explore?listingId={external_id}&referralCode=abc",
      }),
    ).toEqual({
      url: "https://work.mercor.com/explore?listingId=list_AAA&referralCode=abc",
      referral: true,
    });
  });

  it("encodes the job id", () => {
    expect(
      outboundUrl({
        ...job,
        external_id: "a/b?c=d",
        referral_url_template: "https://jobs.example.com/post/{external_id}",
      }).url,
    ).toBe("https://jobs.example.com/post/a%2Fb%3Fc%3Dd");
  });

  it("falls back to the plain link when the template is broken", () => {
    expect(outboundUrl({ ...job, referral_url_template: "https://" })).toEqual({
      url: job.url,
      referral: false,
    });
  });
});

describe("isPreviewHost", () => {
  it.each([
    ["deploy-preview-12--airemoteworkdashboard.netlify.app", true],
    ["main--airemoteworkdashboard.netlify.app", true],
    ["airemoteworkdashboard.netlify.app", false],
    ["yourdomain.com", false],
    ["localhost:3000", false],
    [null, false],
  ])("%s → %s", (host, expected) => {
    expect(isPreviewHost(host)).toBe(expected);
  });
});
