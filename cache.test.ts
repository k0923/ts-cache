import { describe, it,test} from 'vitest'
import { createCacheObj, expireFetch, createStoreHub, NewMapStore, IO } from './core'


interface User {
	name: string
	age: number
}

interface Config {
	token: string
	user: IO<User, User>
}

function wait(milliseconds: number) {
	return new Promise((resolve) => {
		setTimeout(resolve, milliseconds)
	})
}

describe.concurrent('test cache object', () => {
	let count = 0
	const user: User = {
		name: 'young',
		age: 22,
	}

	const cache = new Map<string, any>()

	const configCache = createCacheObj<Config>({
		storeHub: {
			token: NewMapStore(cache, (key) => `token.${key ?? ''}`),
			user: NewMapStore(cache, (key) => `user.${key.name}`),
		},
		providerHub: {
			token: expireFetch(() => {
				return Promise.resolve(`hello_${count++}`)
			}, 3000),
			user: (last, key) => {
				if (last) {
					return Promise.resolve(last.data)
				}
				return Promise.resolve(user)
			},
		},
	})

	it('test cache token', async ({ expect }) => {
		let token = await configCache?.token.get('')
		expect(token).toBe('hello_0')
		token = await configCache?.token.get('')
		expect(token).toBe('hello_0')

		await wait(3000)
		token = await configCache?.token.get('')
		expect(token).toBe('hello_1')
		token = await configCache?.token.get('')
		expect(token).toBe('hello_1')

		configCache?.token.delete('')
		token = await configCache?.token.get('')
		expect(token).toBe('hello_2')

		console.log(cache)
	})

	it('test cache user', async ({ expect }) => {
		const u = await configCache.user.get({ name: 'young', age: 18 })
		expect(u).toBe(user)
		const u2 = await configCache.user.get({ name: 'ethan.zhou', age: 22 })
		expect(u2?.name).toBe('young')
	})
})

describe.concurrent('promise concurrent expire test 1', () => {
	type ConcurrentPromise = {
		name: string
	}

	let count = 0
	const cache = new Map<string, any>()

	const storeApi = createStoreHub<ConcurrentPromise>(
		NewMapStore(cache, (key) => key ?? ''),
		'concurrent'
	)
	const configCache = createCacheObj<ConcurrentPromise>({
		storeHub: storeApi,
		providerHub: {
			name: expireFetch((last, key) => {
				return Promise.resolve(`${count++}`)
			}, 1000),
		},
	})

	it('first', async ({ expect }) => {
		const name = await configCache.name.get('')
		expect(name).toBe('0')

		const name1 = await configCache.name.get('')
		expect(name1).toBe('0')
	})

	it('second', async ({ expect }) => {
		const name = await configCache.name.get('')
		expect(name).toBe('0')
	})

	it('third', async ({ expect }) => {
		const name = await configCache.name.get('')
		expect(name).toBe('0')
		await wait(1010)
		const name1 = await configCache.name.get('')
		expect(name1).toBe('1')
	})
})

describe.concurrent('promise concurrent expire test 2', () => {
	type ConcurrentPromise = {
		name: string
	}

	let count = 0
	const cache = new Map<string, any>()

	const storeApi = createStoreHub<ConcurrentPromise>(
		NewMapStore(cache, (key) => key ?? ''),
		'concurrent'
	)
	const configCache = createCacheObj<ConcurrentPromise>({
		storeHub: storeApi,
		providerHub: {
			name: expireFetch((last, key) => {
				return Promise.resolve(`${count++}`)
			}, 1000),
		},
	})

	for (let i = 0; i < 5; i++) {
		// 为什么是5，是因为vitest并发默认是5个，所以超过的话第6个并发就会异常
		it(`test rount ${i}`, async ({ expect }) => {
			const name = await configCache.name.get('')
			expect(name).toBe('0')

			const name1 = await configCache.name.get('')
			expect(name1).toBe('0')

			await wait(1010)
			const name2 = await configCache.name.get('')
			expect(name2).toBe('1')
		})
	}

	// it('first', async ({ expect }) => {
	// 	const name = await configCache.name.get()
	// 	expect(name).toBe('0')

	// 	const name1 = await configCache.name.get()
	// 	expect(name1).toBe('0')
	// })

	// it('second', async ({ expect }) => {
	// 	const name = await configCache.name.get()
	// 	expect(name).toBe('0')
	// })

	// it('third', async ({ expect }) => {
	// 	await wait(1010)
	// 	const name = await configCache.name.get()
	// 	expect(name).toBe('1')
	// })
})
