import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { heartsFor, setHearts, initialFilters, filterSofas, sortSofas } from '../sofasberlin/catalogue.mjs';

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
