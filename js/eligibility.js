const ANILCA_ELIGIBILITY = {
  requiresCertification: true,
  basis: 'ANILCA Title VIII subsistence eligibility (16 U.S.C. § 3113)',
  label: 'I certify that I qualify for subsistence uses under ANILCA (16 U.S.C. § 3113) for this permit.',
  summary: 'Only for eligible subsistence users (ANILCA)',
  certified: 'You certified that you qualify for subsistence uses under ANILCA',
  intro: 'This permit is available only to eligible subsistence users in Alaska.',
  bullets: [
    'I am eligible for subsistence uses as defined in 16 U.S.C. § 3113.',
    'I will use the forest products collected under this permit for personal or family subsistence use (not commercial resale).',
    'I understand that false statements may be subject to penalties.'
  ],
  citations: [
    {
      label: '16 U.S.C. § 3113',
      url: 'https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title16-section3113&num=0&edition=prelim'
    }
  ]
};

export function getProductEligibility(product) {
  return product?.eligibilityRule === 'anilca-subsistence' ? ANILCA_ELIGIBILITY : null;
}

export function productRequiresEligibility(product) {
  return Boolean(getProductEligibility(product)?.requiresCertification);
}
