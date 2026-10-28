import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { heartsFor, setHearts, initialFilters, filterSofas, sortSofas, restoreScores, nextColumnSort, personHearts, totalHearts } from '../sofasberlin/catalogue.mjs';

const read = async file => JSON.parse(await readFile(new URL(`../sofasberlin/${file}`, import.meta.url)));
const sofas = [...await read('data.json'), ...await read('extra.json')];
const prices = await read('prices.json');

test('existing picks become one heart and an explicit zero clears the pick', () => {
  const sofa = sofas.find(s => s.id === 'additional');
  assert.equal(heartsFor(sofa), 1);
  assert.equal(heartsFor(sofa, { additional: { status: 'liked' } }), 1);
  assert.equal(heartsFor(sofa, { additional: { hearts: 0, status: 'liked' } }), 0);
  assert.equal(heartsFor(sofa, { additional: { status: 'passed' } }), 0);
});

test('ratings preserve saved notes, round-trip through storage and validate the range', () => {
  const before = { ds85: { status: 'liked', note: 'Find olive leather' } };
  const saved = JSON.parse(JSON.stringify(setHearts(before, 'ds85', 3)));
  assert.equal(heartsFor({ id: 'ds85' }, saved), 3);
  assert.equal(saved.ds85.note, 'Find olive leather');
  assert.equal(before.ds85.hearts, undefined);
  assert.equal(heartsFor({ id: 'ds85' }, setHearts(saved, 'ds85', 0)), 0);
  for (const value of [-1, 4, 1.5, '3']) assert.throws(() => setHearts(before, 'ds85', value), RangeError);
});

test('heart, budget and sleeping filters combine on the actual catalogue', () => {
  const preferences = { ds85: { hearts: 3 }, ds76: { hearts: 2 }, multy: { hearts: 1 }, scoop: { hearts: 3 } };
  const filters = { ...initialFilters(), hearts: [2, 3], priceMax: '5000', sleeping: ['bed'] };
  assert.deepEqual(filterSofas(sofas, prices, preferences, filters).map(s => s.id), ['ds76']);
  filters.priceMax = '';
  assert.deepEqual(new Set(filterSofas(sofas, prices, preferences, filters).map(s => s.id)), new Set(['ds85', 'ds76', 'scoop']));
});

test('budget includes the exact upper estimate and excludes quotes and over-budget ranges', () => {
  const filtered = filterSofas(sofas, prices, {}, { ...initialFilters(), priceMax: '5000' });
  const ids = filtered.map(s => s.id);
  assert.ok(ids.includes('marsala'));
  assert.ok(!ids.includes('ds85'));
  assert.ok(!ids.includes('serpentone'));
});

test('price sorting keeps unknown prices last in either direction', () => {
  const subset = ['scoop', 'ds85', 'multy'].map(id => sofas.find(s => s.id === id));
  assert.deepEqual(sortSofas(subset, prices, {}, 'price-asc').map(s => s.id), ['multy', 'ds85', 'scoop']);
  assert.deepEqual(sortSofas(subset, prices, {}, 'price-desc').map(s => s.id), ['ds85', 'multy', 'scoop']);
  assert.deepEqual(sortSofas(subset, prices, { multy: { hearts: 3 }, ds85: { hearts: 2 } }, 'hearts-desc').map(s => s.id), ['multy', 'ds85', 'scoop']);
});

test('saved scores restore on a new browser while newer browser ratings and notes survive', () => {
  const saved = { scores: { ds85: 3, superonda: 3, multy: 3, invalid: 9 } };
  const restored = restoreScores(saved, { ds85: { hearts: 0, note: 'Changed my mind' } });
  assert.equal(restored.ds85.hearts, 0);
  assert.equal(restored.ds85.note, 'Changed my mind');
  assert.equal(restored.superonda.hearts, 3);
  assert.equal(restored.invalid, undefined);
});

test('the backed-up scores determine the default order and retain all 40 original ratings', async () => {
  const snapshot = await read('ratings.json');
  assert.equal(Object.keys(snapshot.scores).length, 40);
  const ordered = sortSofas(sofas, prices, restoreScores(snapshot), initialFilters().sort);
  assert.deepEqual(new Set(ordered.slice(0, 5).map(s => s.id)), new Set(['ds85', 'ds76', 'superonda', 'multy', 'strips']));
});

test('new sofa beds are verified convertibles and the sofa-bed view excludes daybeds', () => {
  const recent = filterSofas(sofas, prices, {}, initialFilters(), '', 'newbeds');
  assert.ok(recent.length >= 6);
  assert.ok(recent.every(s => s.bed === 'bed' && s.images.length && prices[s.id]));
  const beds = filterSofas(sofas, prices, {}, initialFilters(), '', 'beds');
  assert.ok(beds.every(s => s.bed === 'bed'));
  assert.ok(!beds.some(s => s.id === 'trio'));
});

test('a column starts ascending, reverses on the second click and replaces the previous sort', () => {
  assert.equal(nextColumnSort('hearts-desc', 'price'), 'price-asc');
  assert.equal(nextColumnSort('price-asc', 'price'), 'price-desc');
  assert.equal(nextColumnSort('price-desc', 'price'), 'price-asc');
  assert.equal(nextColumnSort('price-desc', 'designer'), 'designer-asc');
  assert.equal(nextColumnSort('designer-desc', 'sofa'), 'name-asc');
  assert.equal(nextColumnSort('name-asc', 'sleeping'), 'bed-asc');
});

test('bed and text column order reverse consistently', () => {
  const subset = ['ds85', 'superonda', 'marsala'].map(id => sofas.find(s => s.id === id));
  assert.deepEqual(sortSofas(subset, prices, {}, 'bed-asc').map(s => s.bed), ['bed', 'daybed', 'none']);
  assert.deepEqual(sortSofas(subset, prices, {}, 'bed-desc').map(s => s.bed), ['none', 'daybed', 'bed']);
  assert.deepEqual(sortSofas(subset, prices, {}, 'name-desc').map(s => s.name), ['Superonda', 'Marsala', 'DS-85']);
});


test('three independent ratings total at most nine and clearing preserves other people', () => {
  const people = { clara: { ds85: 3 }, mamer: { ds85: 3 }, frido: { ds85: 3 } };
  assert.equal(totalHearts(people, 'ds85'), 9);
  people.clara.ds85 = 0;
  assert.equal(totalHearts(people, 'ds85'), 6);
  assert.equal(personHearts(people, 'ds85', 'frido'), 3);
  assert.equal(totalHearts(people, 'unknown'), 0);
  for (const invalid of [-1, 4, 1.5, '3']) {
    people.clara.ds85 = invalid;
    assert.equal(personHearts(people, 'ds85', 'clara'), 0);
  }
});

test('group total and each person sort independently, ascending then descending', () => {
  const subset = ['ds85', 'ds76', 'multy'].map(id => sofas.find(s => s.id === id));
  const people = { clara: { ds85: 0, ds76: 1, multy: 2 }, mamer: { ds85: 3, ds76: 0, multy: 2 }, frido: { ds85: 3, ds76: 0, multy: 1 } };
  const ordered = sort => sortSofas(subset, prices, {}, sort, [], people).map(s => s.id);
  assert.deepEqual(ordered('total-desc'), ['ds85', 'multy', 'ds76']);
  assert.deepEqual(ordered('total-asc'), ['ds76', 'multy', 'ds85']);
  assert.deepEqual(ordered('clara-desc'), ['multy', 'ds76', 'ds85']);
  assert.deepEqual(ordered('mamer-asc'), ['ds76', 'multy', 'ds85']);
  assert.deepEqual(ordered('frido-desc'), ['ds85', 'multy', 'ds76']);
  assert.equal(nextColumnSort('total-desc', 'clara'), 'clara-asc');
  assert.equal(nextColumnSort('clara-asc', 'clara'), 'clara-desc');
});
