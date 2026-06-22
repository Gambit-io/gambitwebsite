// The headache persona from the build spec, used to validate the engine.
export const HEADACHE = {
  id: 'p001',
  display_name: 'Maria, 35',
  age: 35,
  sex: 'female',
  complaint: 'headache',
  expected_endpoint: 'Video visit',
  affirms: [
    'this headache is different than my usual headaches',
    'I have a history of occasional headaches',
  ],
  negates: [
    'this is not a mild headache',
  ],
  clinical_truth:
    'New-character headache in someone with prior mild headaches. Warrants a prompt virtual evaluation, not the ER, not self-care.',
  character: {
    personality: 'anxious, over-explains',
    health_literacy: 'low, uses plain language',
    emotional_state: 'worried but coherent',
    speech_style: 'short messages, some run-ons',
  },
};
