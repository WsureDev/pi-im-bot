import { expect, test } from 'bun:test'
import { counterRate, cpuCounters, diskCounters, networkCounters } from '../src/runtime/status/linux-counters'

test('Linux rates use elapsed time, reject counter resets and avoid guest CPU double counting', () => {
  expect(counterRate(1024, 1536, 250)).toBe(2048)
  expect(counterRate(2000, 10, 1000)).toBeNull()
  expect(counterRate(undefined, 10, 1000)).toBeNull()
  expect(cpuCounters('cpu 10 2 3 80 5 0 0 0 7 1\ncpu0 10 2 3 80 5 0 0 0 7 1')[0].total).toBe(100)
})
test('Disk metrics avoid partition/device-mapper double counting and NIC errors retain their units', () => {
  const disks = diskCounters(
    '8 0 sda 2 0 16 0 3 0 32 0 0 100 0\n8 1 sda1 2 0 16 0 3 0 32 0 0 100 0\n253 0 dm-0 2 0 16 0 3 0 32 0 0 100 0\n259 0 nvme0n1 1 0 8 0 1 0 4 0 0 5 0\n259 1 nvme0n1p1 1 0 8 0 1 0 4 0 0 5 0'
  )
  expect(
    disks.map((entry) => {
      return entry.name
    })
  ).toEqual(['sda', 'nvme0n1'])
  expect(disks[0].readBytes).toBe(8192)
  expect(networkCounters('eth0: 100 1 2 3 0 0 0 0 200 2 4 5 0 0 0 0')[0]).toEqual({
    name: 'eth0',
    receivedBytes: 100,
    sentBytes: 200,
    receiveErrors: 2,
    receiveDrops: 3,
    transmitErrors: 4,
    transmitDrops: 5
  })
})
