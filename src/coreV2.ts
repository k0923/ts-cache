export interface CacheData<T = any> {
	data: T
	created_at: number
}

export interface Store<TKey, TValue> {
	set: (key: TKey, data: TValue) => Promise<void>
	get: (key: TKey) => Promise<CacheData<TValue> | undefined>
	delete: (key: TKey) => Promise<void>
	clear: () => Promise<void>
}

export interface Cache<TKey, TValue> {
	set: (key: TKey, value: TValue) => Promise<void>
	get: (key: TKey) => Promise<TValue | undefined>
	delete: (key: TKey) => Promise<void>
	clear: () => Promise<void>
}

type Provider<TKey,TValue> = (last:CacheData<TValue> | undefined,key:TKey) => Promise<TValue | undefined>

function createCache<TKey,TValue>(store:Store<TKey,TValue>,provider?:Provider<TKey,TValue>):Cache<TKey,TValue> {
	

}

export function createMapStore<TKey, TValue>(convert: (key: TKey) => string): Store<TKey, TValue> {
	const map = new Map<string, CacheData<TValue>>()
	return {
		get: (key) => {
			const strKey = convert(key)
			const result = map.get(strKey)
			return Promise.resolve(result)
		},
		set: (key, value) => {
			const strKey = convert(key)
			map.set(strKey, {
				data: value,
				created_at: Date.now(),
			})
			return Promise.resolve()
		},
		clear: () => {
			map.clear()
			return Promise.resolve()
		},
		delete: (key) => {
			const strKey = convert(key)
			map.delete(strKey)
			return Promise.resolve()
		},
	}
}
