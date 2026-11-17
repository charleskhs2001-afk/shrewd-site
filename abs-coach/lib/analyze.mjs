// Photo analysis with Claude. Takes the relaxed + tensed photos (and the previous pair at a
// check-in) and returns a body-fat range, an ab "stage", a short summary and a comparison.
// Photos are passed straight through to the API and never written to disk or logged.

import Anthropic from '@anthropic-ai/sdk';

export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';
const EFFORT = process.env.ANTHROPIC_EFFORT || 'medium';

let client = null;
const getClient = () => (client ??= new Anthropic({ timeout: 90_000, maxRetries: 1 }));

export class AnalysisError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

const SCHEMA = {
  type: 'object',
  properties: {
    photo_ok: { type: 'boolean' },
    photo_problem: { type: 'string' },
    body_fat_low: { type: 'number' },
    body_fat_high: { type: 'number' },
    ab_stage: { type: 'integer', enum: [0, 1, 2, 3, 4, 5] },
    visible: {
      type: 'object',
      properties: {
        upper: { type: 'boolean' },
        middle: { type: 'boolean' },
        lower: { type: 'boolean' },
        obliques: { type: 'boolean' },
      },
      required: ['upper', 'middle', 'lower', 'obliques'],
      additionalProperties: false,
    },
    summary: { type: 'string' },
    photo_tips: { type: 'array', items: { type: 'string' } },
    comparison: { type: 'string', enum: ['none', 'leaner', 'same', 'softer', 'unclear'] },
    comparison_notes: { type: 'string' },
  },
  required: ['photo_ok', 'photo_problem', 'body_fat_low', 'body_fat_high', 'ab_stage', 'visible', 'summary', 'photo_tips', 'comparison', 'comparison_notes'],
  additionalProperties: false,
};

const SYSTEM = `You are the photo-analysis step of Core Check, a fitness app that builds a fat-loss and ab-training plan. The user has photographed their own bare midsection twice: once relaxed and once with their abs tensed. At a check-in you also see the pair from their previous check-in. The app turns your answer into calorie targets and a timeline, so accuracy matters more than encouragement.

What to return:
1. photo_ok: false only when the photos clearly can't be used: no bare midsection visible, stomach covered by clothing, too dark or blurry to see it, more than one person, nudity beyond a bare torso with shorts or underwear, or the person looks like a child. Then give a short, friendly reason in photo_problem, written to the user (for example "your top is covering your stomach"). Otherwise photo_ok is true and photo_problem is "".
2. body_fat_low / body_fat_high: an estimated body-fat range, 3 to 5 points wide. Use the visible definition and waist shape together with the stated sex, age, height and weight. Their self-rating is context only.
3. ab_stage on the scale below, and which areas are visible when tensed.
4. summary: 2 or 3 short sentences in plain British English, second person: what is showing now and the single change that will make the biggest difference. Kind and direct. Comment only on body fat, muscle definition and photo quality, never on attractiveness, skin, body hair, tattoos or anything else about the person.
5. photo_tips: up to 2 short tips for taking more consistent photos next time, or an empty list if they are good.
6. comparison (check-ins only): leaner, same, softer, or unclear when lighting, angle, distance or pose differ too much to judge. Fat loss over five days is often invisible, so answer "same" unless the difference is clear, and don't mistake brighter overhead light or a harder flex for progress. comparison_notes: one or two sentences on what you compared. With no previous photos, comparison is "none" and comparison_notes is "".

Ab stage scale, with typical body fat for men / women:
0 No outline: smooth or soft even when tensed (men over 22%, women over 30%)
1 First hints: faint centre line or upper outline only when tensed (18-22% / 26-30%)
2 Upper abs: top two show when tensed, faint when relaxed (15-18% / 23-26%)
3 Visible abs: four clear when tensed, upper outline when relaxed (12-15% / 20-23%)
4 Six-pack: six clear when tensed, four or more when relaxed (10-12% / 17-20%)
5 Shredded: sharp six-pack relaxed, obliques and V-lines visible (under 10% / under 17%)`;

const STAGE_NAMES = ['no outline', 'first hints', 'upper abs', 'visible abs', 'six-pack', 'shredded'];

function imageBlock(b64) {
  const media_type = b64.startsWith('iVBOR') ? 'image/png' : 'image/jpeg';
  return { type: 'image', source: { type: 'base64', media_type, data: b64 } };
}

function describe({ profile, selfStage, previous }) {
  const p = profile;
  const lines = [
    `About the user: ${p.sex}, ${p.age} years old, ${Math.round(p.heightCm)} cm, ${p.weightKg.toFixed(1)} kg today${p.waistCm ? `, waist ${p.waistCm.toFixed(1)} cm at the navel` : ''}.`,
  ];
  if (selfStage != null) lines.push(`They rated their tensed photo as stage ${selfStage} (${STAGE_NAMES[selfStage]}).`);
  if (p.goalStage != null) lines.push(`Their goal is stage ${p.goalStage} (${STAGE_NAMES[p.goalStage]}).`);
  if (previous) {
    lines.push(
      `Previous check-in ${previous.daysAgo} days ago: ${previous.weightKg.toFixed(1)} kg${previous.waistCm ? `, waist ${previous.waistCm.toFixed(1)} cm` : ''}${previous.bf ? `, estimated ${previous.bf.toFixed(1)}% body fat` : ''}${previous.stage != null ? `, stage ${previous.stage}` : ''}.`,
    );
    if (!previous.images) lines.push('The previous photos are not available, so set comparison to "none".');
  } else {
    lines.push('This is their first set of photos, so comparison is "none".');
  }
  return lines.join('\n');
}

// Fallbacks re-run a declined request on another model; Haiku and older models don't take them.
const takesFallbacks = (model) => /^claude-(opus-5|fable-5|sonnet-5-5|mythos-5)/.test(model);

export async function analysePhotos(input) {
  const content = [
    { type: 'text', text: 'Photo 1: today, relaxed.' },
    imageBlock(input.images.relaxed),
    { type: 'text', text: 'Photo 2: today, tensed.' },
    imageBlock(input.images.tensed),
  ];
  if (input.previous?.images) {
    content.push(
      { type: 'text', text: `Photo 3: ${input.previous.daysAgo} days ago, relaxed.` },
      imageBlock(input.previous.images.relaxed),
      { type: 'text', text: `Photo 4: ${input.previous.daysAgo} days ago, tensed.` },
      imageBlock(input.previous.images.tensed),
    );
  }
  content.push({ type: 'text', text: describe(input) });

  const params = {
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    messages: [{ role: 'user', content }],
    output_config: { effort: EFFORT, format: { type: 'json_schema', schema: SCHEMA } },
  };

  let res;
  try {
    res = takesFallbacks(MODEL)
      ? await getClient().beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
      : await getClient().messages.create(params);
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
      console.error('Anthropic API key rejected:', e.status);
      throw new AnalysisError('Photo analysis is not set up correctly on this server.', 503);
    }
    if (e instanceof Anthropic.RateLimitError) throw new AnalysisError('The photo analyser is busy. Try again in a minute.', 503);
    if (e instanceof Anthropic.BadRequestError) {
      console.error('Anthropic rejected the request:', e.message);
      throw new AnalysisError('Those photos could not be analysed. Try retaking them.', 422);
    }
    if (e instanceof Anthropic.APIConnectionError) throw new AnalysisError('Could not reach the photo analyser. Try again shortly.', 503);
    if (e instanceof Anthropic.APIError) {
      console.error('Anthropic API error:', e.status, e.message);
      throw new AnalysisError('The photo analyser had a problem. Try again shortly.', 502);
    }
    throw e;
  }

  if (res.stop_reason === 'refusal') throw new AnalysisError('These photos could not be analysed. Use photos that show just your stomach, with shorts or underwear on.', 422);
  if (res.stop_reason === 'max_tokens') throw new AnalysisError('The photo analyser ran out of time. Try again.', 502);
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new AnalysisError('The photo analyser gave an unexpected answer. Try again.', 502);
  }
  return clean(data, !!input.previous?.images, res.usage);
}

const str = (s, max) => String(s ?? '').trim().slice(0, max);
const clampNum = (n, lo, hi) => Math.min(hi, Math.max(lo, Number(n) || 0));

function clean(d, hasPrevious) {
  let lo = clampNum(d.body_fat_low, 3, 60);
  let hi = clampNum(d.body_fat_high, 3, 60);
  if (lo > hi) [lo, hi] = [hi, lo];
  if (hi - lo < 2) hi = Math.min(60, lo + 2);
  const comparisons = ['none', 'leaner', 'same', 'softer', 'unclear'];
  return {
    photo_ok: !!d.photo_ok,
    photo_problem: str(d.photo_problem, 200),
    body_fat_low: Math.round(lo * 10) / 10,
    body_fat_high: Math.round(hi * 10) / 10,
    ab_stage: Math.round(clampNum(d.ab_stage, 0, 5)),
    visible: {
      upper: !!d.visible?.upper,
      middle: !!d.visible?.middle,
      lower: !!d.visible?.lower,
      obliques: !!d.visible?.obliques,
    },
    summary: str(d.summary, 600),
    photo_tips: (Array.isArray(d.photo_tips) ? d.photo_tips : []).slice(0, 2).map((t) => str(t, 200)).filter(Boolean),
    comparison: hasPrevious && comparisons.includes(d.comparison) ? d.comparison : 'none',
    comparison_notes: hasPrevious ? str(d.comparison_notes, 400) : '',
  };
}
