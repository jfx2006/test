/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for the ReadableStreams generated by CalReadableStreamFactory.
 */

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { CalEvent } = ChromeUtils.import("resource:///modules/CalEvent.jsm");
var { CalReadableStreamFactory } = ChromeUtils.import(
  "resource:///modules/CalReadableStreamFactory.jsm"
);

/**
 * @type {Object} BoundedReadableStreamTestSpec
 * @property {number}   maxTotalItems
 * @property {number}   maxQueuedItems
 * @property {number}   actualTotalItems
 * @property {number}   actualChunkSize
 * @property {Function} onChunk
 */

/**
 * Common test for the BoundedReadableStream.
 * @param {BoundedReadableStreamTestSpec} spec
 */
async function doBoundedReadableStreamTest({
  maxTotalItems,
  maxQueuedItems,
  actualTotalItems,
  actualChunkSize,
  onChunk,
}) {
  let totalChunks = Math.ceil(actualTotalItems / actualChunkSize);
  let stream = CalReadableStreamFactory.createBoundedReadableStream(maxTotalItems, maxQueuedItems, {
    start(controller) {
      let i = 0;
      for (i; i < totalChunks; i++) {
        controller.enqueue(
          Array(actualChunkSize)
            .fill(null)
            .map(() => new CalEvent())
        );
      }
      info(
        `Enqueued ${i *
          actualChunkSize} items across ${i} chunks at a rate of ${actualChunkSize} items per chunk`
      );
    },
  });

  for await (let chunk of cal.iterate.streamValues(stream)) {
    Assert.ok(Array.isArray(chunk), "chunk received is an array");
    Assert.ok(
      chunk.every(item => item instanceof CalEvent),
      "all chunk elements are CalEvent instances"
    );
    onChunk(chunk);
  }
}

/**
 * Tests the BoundedReadableStream works as expected when the total items enqueued
 * and the chunk size match the limits set.
 */
add_task(async function testBoundedReadableStreamWorksWithinLimits() {
  let maxTotalItems = 35;
  let maxQueuedItems = 5;
  let totalChunks = 35 / 5;

  let chunksRead = 0;
  await doBoundedReadableStreamTest({
    maxTotalItems,
    maxQueuedItems,
    actualTotalItems: maxTotalItems,
    actualChunkSize: maxQueuedItems,
    onChunk(chunk) {
      Assert.equal(chunk.length, maxQueuedItems, `chunk has ${maxQueuedItems} items`);
      chunksRead++;
    },
  });
  Assert.equal(chunksRead, totalChunks, `received ${totalChunks} chunks from stream`);
});

/**
 * Tests that the stream automatically closes when maxTotalItemsReached is true
 * even if there are more items to come.
 */
add_task(async function testBoundedReadableStreamClosesIfMaxTotalItemsReached() {
  let maxTotalItems = 35;
  let maxQueuedItems = 5;
  let items = [];

  await doBoundedReadableStreamTest({
    maxTotalItems,
    maxQueuedItems,
    actualTotalItems: 50,
    actualChunkSize: 7,
    onChunk(chunk) {
      items = items.concat(chunk);
    },
  });
  Assert.equal(items.length, maxTotalItems, `received ${maxTotalItems} items from stream`);
});

/**
 * Test that chunks enqueued with smaller than the maxQueueSize value are held
 * until the threshold is reached.
 */
add_task(async function testBoundedReadableStreamBuffersChunks() {
  let maxTotalItems = 35;
  let maxQueuedItems = 5;
  let totalChunks = 35 / 5;

  let chunksRead = 0;
  await doBoundedReadableStreamTest({
    maxTotalItems,
    maxQueuedItems,
    actualTotalItems: 35,
    actualChunkSize: 1,
    onChunk(chunk) {
      Assert.equal(chunk.length, maxQueuedItems, `chunk has ${maxQueuedItems} items`);
      chunksRead++;
    },
  });
  Assert.equal(chunksRead, totalChunks, `received ${totalChunks} chunks from stream`);
});

/**
 * Test the CombinedReadbleStream streams from all of its streams.
 */
add_task(async function testCombinedReadableStreamStreamsAll() {
  let mkStream = () =>
    CalReadableStreamFactory.createReadableStream({
      start(controller) {
        for (let i = 0; i < 5; i++) {
          controller.enqueue(new CalEvent());
        }
        controller.close();
      },
    });

  let stream = CalReadableStreamFactory.createCombinedReadableStream([
    mkStream(),
    mkStream(),
    mkStream(),
  ]);

  let items = [];
  for await (let value of cal.iterate.streamValues(stream)) {
    Assert.ok(value instanceof CalEvent, "value read from stream is CalEvent instance");
    items.push(value);
  }
  Assert.equal(items.length, 15, "read a total of 15 items from the stream");
});

/**
 * Test the MappedReadableStream applies the MapStreamFunction to each value
 * read from the stream.
 */
add_task(async function testMappedReadableStream() {
  let stream = CalReadableStreamFactory.createMappedReadableStream(
    CalReadableStreamFactory.createReadableStream({
      start(controller) {
        for (let i = 0; i < 10; i++) {
          controller.enqueue(1);
        }
        controller.close();
      },
    }),
    value => value * 0
  );

  let values = [];
  for await (let value of cal.iterate.streamValues(stream)) {
    Assert.equal(value, 0, "read value inverted to 0");
    values.push(value);
  }
  Assert.equal(values.length, 10, "all 10 values were transformed");
});

/**
 * Test the EmptyReadableStream is already closed.
 */
add_task(async function testEmptyReadableStream() {
  let stream = CalReadableStreamFactory.createEmptyReadableStream();
  let values = [];
  for await (let value of cal.iterate.streamValues(stream)) {
    values.push(value);
  }
  Assert.equal(values.length, 0, "no values were read from the empty stream");
});
