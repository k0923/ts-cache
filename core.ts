export interface CacheData<T = any> {
	data: T
	created_at: number
}

export interface IO<Input, Output> {
	input: Input
	output: Output
}

export type IOKey<T> = T extends IO<infer Input, infer Output> ? Input : string
export type IOValue<T> = T extends IO<infer Input, infer Output> ? Output : T | undefined

type Provider<T> = (last: CacheData<IOValue<T>> | null | undefined, key: IOKey<T>) => Promise<IOValue<T>>

export interface Store<T> {
	set: (key: string, data: CacheData<IOValue<T>>) => Promise<void>
	get: (key: string) => Promise<CacheData<IOValue<T>> | null | undefined>
	delete: (key: string) => Promise<void>
	clear: () => Promise<void>
	convert: (key: IOKey<T>) => string
}

type ProviderHub<T> = {
	[K in keyof T]: Provider<T[K]>
}

export type StoreHub<T> = {
	[K in keyof T]: Store<T[K]>
}

export interface CacheHub<T = any> {
	providerHub: ProviderHub<T>
	storeHub: StoreHub<T>
}

export type KeyType<T> = Extract<keyof T, string>

const buildKey = (business: string, scope?: string, key?: string) => {
	if (scope && key) {
		return `${scope}.${business}.${key}`
	}
	if (scope) {
		return `${scope}.${business}`
	}
	if (key) {
		return `${business}.${key}`
	}
	return business
}

export function NewMapStore<T = any>(map: Map<string, CacheData<IOValue<T>>>, convert: (key: IOKey<T>) => string): Store<T> {
	return {
		get: (key) => {
			const result = map.get(`${key}`)
			return Promise.resolve(result)
		},
		set: (key, value) => {
			map.set(`${key}`, value)
			return Promise.resolve()
		},
		delete: (key) => {
			map.delete(`${key}`)
			return Promise.resolve()
		},
		clear: () => {
			map.clear()
			return Promise.resolve()
		},
		convert: (key) => {
			return convert(key)
		},
	}
}

function buildLocalStorageKey(scope: string, key: string) {
	return `${scope}.${key}`
}

export function NewLocalStorage<T = any>(scope: string, convert: (key: IOKey<T>) => string): Store<T> {
	return {
		get: (key) => {
			try {
				const result = localStorage.getItem(buildLocalStorageKey(scope, key))
				if (result) {
					return Promise.resolve(JSON.parse(result))
				}
				return Promise.resolve(null)
			} catch (err) {
				console.error(err)
				return Promise.reject(err)
			}
		},
		set: (key, value) => {
			try {
				localStorage.setItem(buildLocalStorageKey(scope, key), JSON.stringify(value))
				return Promise.resolve()
			} catch (err) {
				console.error(err)
				return Promise.reject(err)
			}
		},
		delete: (key) => {
			try {
				localStorage.removeItem(buildLocalStorageKey(scope, key))
				return Promise.resolve()
			} catch (err) {
				console.error(err)
				return Promise.reject(err)
			}
		},
		clear: () => {
			if (scope.length == 0) {
				return Promise.resolve()
			}
			const keyArr: string[] = []
			for (let i = 0; i < localStorage.length; i++) {
				const key = localStorage.key(i) //获取本地存储的Key
				if (key?.startsWith(scope)) {
					keyArr.push(key)
				}
			}
			keyArr.forEach((key) => {
				localStorage.removeItem(key)
			})
			return Promise.resolve()
		},
		convert: (key) => convert(key),
	}
}

export function createStoreHub<T = any>(cache: Store<T>, scope?: string): StoreHub<T> {
	type E = KeyType<T>
	return new Proxy<StoreHub<T>>({} as StoreHub<T>, {
		get: (target, p) => {
			const business = p as E
			let handler = Reflect.get(target, business) as Store<T[E]>
			if (!handler) {
				handler = {
					get: (key) => {
						const result = cache.get(buildKey(business, scope, key)) as any
						return Promise.resolve(result)
					},
					set: (key, data) => {
						cache.set(buildKey(business, scope, key), data as any)
						return Promise.resolve()
					},
					delete: (key) => {
						cache.delete(buildKey(business, scope, key))
						return Promise.resolve()
					},
					clear: () => {
						return cache.clear()
					},
					convert: (key) => {
						if (typeof key === 'string') {
							return key
						}
						return ''
					},
				}
				target[business] = handler
			}
			return handler
		},
	})
}

export interface CacheApi<T> {
	get: (key: IOKey<T>) => Promise<IOValue<T>>
	delete: (key: IOKey<T>) => Promise<void>
	set: (key: IOKey<T>, value: IOValue<T>) => Promise<void>
	clear: () => Promise<void>
}

export interface CommonCacheApi<T> {
	get: (key: string) => Promise<T>
	delete: (key: string) => Promise<void>
	set: (key: string, value: T) => Promise<void>
	clear: () => Promise<void>
}

export type CacheObj<T> = {
	[K in keyof T]: CacheApi<T[K]>
}

/**
 * Return a proxy cache object
 * @param scope cache scope,each cach object should has a unique scope
 * @param config  cache configuration, include cache refresh api and cache store api
 * @returns return a cache proxy object
 */
export function createCacheObj<T>(config: CacheHub<T>) {
	type E = KeyType<T>
	return new Proxy<CacheObj<T>>({} as CacheObj<T>, {
		get(target, p, receiver) {
			const business = p as E
			let handler = Reflect.get(target, business) as CacheApi<T[E]>
			if (!handler) {
				const storeApi = config.storeHub[business]
				const fetchApi = config.providerHub[business]
				handler = createCache<T[E]>(storeApi, fetchApi)
				target[business] = handler
			}
			return handler
		},
	})
}

export function expireFetch<T>(fn: Provider<T>, milliseconds: number): Provider<T> {
	return (last, key) => {
		if (!last) {
			// 如果不存在直接返回原来的
			return fn(last, key)
		}
		// 说明未过期
		if (Date.now() - last.created_at < milliseconds) {
			return Promise.resolve(last.data)
		}

		return fn(last, key)
	}
}

function getPromise<T>(key: string, map: Map<string, Promise<T>>, provider: () => Promise<T>): Promise<T> {
	if (map.has(key)) {
		return map.get(key)!
	}
	const result = provider()
	map.set(key, result)
	result.finally(() => map.delete(key))
	return result
}

export function createCache<T = any>(store: Store<T>, provider: Provider<T>): CacheApi<T> {
	const getMap = new Map<string, Promise<IOValue<T>>>()
	const deleteMap = new Map<string, Promise<void>>()
	const setMap = new Map<string, Promise<void>>()

	const fn = async (key: IOKey<T>, storeKey: string) => {
		try {
			const item = await store.get(storeKey)
			const result = await provider(item, key)
			if (result !== item?.data) {
				// 如果相等，说明值不变
				const newCacheData: CacheData<IOValue<T>> = {
					data: result,
					created_at: Date.now(),
				}
				await store.set(storeKey, newCacheData)
			}
			return result
		} catch (err) {
			console.error(err)
			return Promise.reject(err)
		}
	}

	return {
		get: async (key: IOKey<T>) => {
			const storeKey = store.convert(key)
			return getPromise(storeKey, getMap, () => fn(key, storeKey))
		},
		delete: async (key: IOKey<T>) => {
			const storeKey = store.convert(key)
			return getPromise(storeKey, deleteMap, async () => {
				try {
					await store.delete(storeKey)
				} catch (err) {
					console.error(err)
					return Promise.reject(err)
				}
			})
		},
		set: async (key: IOKey<T>, value: IOValue<T>) => {
			const storeKey = store.convert(key)
			return getPromise(storeKey, setMap, async () => {
				try {
					await store.set(storeKey, {
						data: value,
						created_at: Date.now(),
					})
				} catch (err) {
					console.error(err)
					return Promise.reject(err)
				}
			})
		},
		clear: async () => {
			try {
				await store.clear()
			} catch (err) {
				console.error(err)
				return Promise.reject(err)
			}
		},
	}
}
