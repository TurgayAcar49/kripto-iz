import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitMbox, parseMessage, createScanner, rootDomain } from '../js/mail.js';

const enc = (s) => new TextEncoder().encode(s);

async function collect(text, chunkSize = 7) {
  const bytes = enc(text);
  async function* chunks() {
    for (let i = 0; i < bytes.length; i += chunkSize) yield bytes.subarray(i, i + chunkSize);
  }
  const out = [];
  for await (const raw of splitMbox(chunks())) out.push(raw);
  return out;
}

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

const MBOX = [
  'From 1@xxx Mon Jan 01 00:00:00 2024',
  'From: Privy <no-reply@privy.io>',
  'Subject: 482913 is your login code for Hyperdrive',
  'Date: Tue, 12 Nov 2024 10:00:00 +0000',
  '',
  'Use this code to sign in.',
  '',
  'From 2@xxx Mon Jan 01 00:00:00 2024',
  'From: "Kalos Finance" <hello@mail.kalos.fi>',
  `Subject: =?UTF-8?B?${b64('Likidite eklendi ✅')}?=`,
  'Date: Wed, 13 Nov 2024 10:00:00 +0000',
  'MIME-Version: 1.0',
  'Content-Type: multipart/alternative; boundary="b1"',
  '',
  '--b1',
  'Content-Type: text/plain; charset=utf-8',
  'Content-Transfer-Encoding: base64',
  '',
  b64('Your deposit to the liquidity pool is confirmed.\nWallet: 0x1111111111111111111111111111111111111111\n'),
  '--b1',
  'Content-Type: text/html; charset=utf-8',
  '',
  '<p>ignored because plain text comes first</p>',
  '--b1--',
  '',
  'From 3@xxx Mon Jan 01 00:00:00 2024',
  'From: Market <news@grocery.com>',
  'Subject: =?ISO-8859-9?Q?Haftan=FDn_f=FDrsatlar=FD?=',
  'Date: Thu, 14 Nov 2024 10:00:00 +0000',
  'Content-Type: text/plain; charset=iso-8859-9',
  'Content-Transfer-Encoding: quoted-printable',
  '',
  'Domates indirimde, =C3=A7ok ucuz.',
  '',
].join('\r\n');

test('splits mbox across arbitrary chunk boundaries and CRLF line endings', async () => {
  const raws = await collect(MBOX);
  assert.equal(raws.length, 3);
  assert.ok(!raws[0].includes('\r'));
});

test('decodes encoded headers, base64 multipart and quoted-printable bodies', async () => {
  const [, kalos, grocery] = (await collect(MBOX)).map(parseMessage);
  assert.equal(kalos.subject, 'Likidite eklendi ✅');
  assert.equal(kalos.fromName, 'Kalos Finance');
  assert.equal(kalos.domain, 'mail.kalos.fi');
  assert.match(kalos.text, /liquidity pool is confirmed/);
  assert.equal(grocery.subject, 'Haftanın fırsatları');
});

test('groups crypto mails into projects and skips unrelated mail', async () => {
  const scanner = createScanner();
  for (const raw of await collect(MBOX)) scanner.add(raw);
  const { total, matched, projects } = scanner.result();
  assert.equal(total, 3);
  assert.equal(matched, 2);

  const privy = projects.find((p) => p.provider === 'Privy');
  assert.equal(privy.name, 'Hyperdrive');
  assert.equal(privy.type, 'gömülü cüzdan');

  const kalos = projects.find((p) => p.key === 'kalos.fi');
  assert.equal(kalos.type, 'proje');
  assert.ok(kalos.tags.includes('deposit') && kalos.tags.includes('likidite'));
  assert.deepEqual(kalos.addresses, [{ address: '0x1111111111111111111111111111111111111111', count: 1 }]);
});

test('rootDomain handles country second-level domains', () => {
  assert.equal(rootDomain('mail.kalos.fi'), 'kalos.fi');
  assert.equal(rootDomain('news.example.com.tr'), 'example.com.tr');
});
