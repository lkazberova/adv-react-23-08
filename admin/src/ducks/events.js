import { all, takeEvery, put, take, select, call } from 'redux-saga/effects'
import { appName } from '../config'
import { Record, OrderedMap, OrderedSet } from 'immutable'
import firebase from 'firebase/app'
import { createSelector } from 'reselect'
import { fbToEntities } from './utils'

/**
 * Constants
 * */
export const moduleName = 'events'
const prefix = `${appName}/${moduleName}`

export const FETCH_ALL_REQUEST = `${prefix}/FETCH_ALL_REQUEST`
export const FETCH_ALL_START = `${prefix}/FETCH_ALL_START`
export const FETCH_ALL_SUCCESS = `${prefix}/FETCH_ALL_SUCCESS`

export const TOGGLE_SELECT = `${prefix}/TOGGLE_SELECT`

export const FETCH_LAZY_REQUEST = `${prefix}/FETCH_LAZY_REQUEST`
export const FETCH_LAZY_START = `${prefix}/FETCH_LAZY_START`
export const FETCH_LAZY_SUCCESS = `${prefix}/FETCH_LAZY_SUCCESS`

/**
 * Reducer
 * */
export const ReducerRecord = Record({
  loading: false,
  loaded: false,
  selected: new OrderedSet([]),
  entities: new OrderedMap()
})

export const EventRecord = Record({
  id: null,
  month: null,
  submissionDeadline: null,
  title: null,
  url: null,
  when: null,
  where: null
})

export default function reducer(state = new ReducerRecord(), action) {
  const { type, payload } = action

  switch (type) {
    case FETCH_ALL_START:
    case FETCH_LAZY_START:
      return state.set('loading', true)

    case FETCH_ALL_SUCCESS:
      return state
        .set('loading', false)
        .set('loaded', true)
        .set('entities', fbToEntities(payload, EventRecord))

    case FETCH_LAZY_SUCCESS:
      return state
        .set('loading', false)
        .mergeIn(['entities'], fbToEntities(payload, EventRecord))
        .set('loaded', Object.keys(payload).length < 10)

    case TOGGLE_SELECT:
      return state.update(
        'selected',
        (selected) =>
          selected.has(payload.id)
            ? selected.remove(payload.id)
            : selected.add(payload.id)
      )

    default:
      return state
  }
}

/**
 * Selectors
 * */

export const stateSelector = (state) => state[moduleName]
export const entitiesSelector = createSelector(
  stateSelector,
  (state) => state.entities
)
export const loadingSelector = createSelector(
  stateSelector,
  (state) => state.loading
)
export const loadedSelector = createSelector(
  stateSelector,
  (state) => state.loaded
)
export const eventListSelector = createSelector(entitiesSelector, (entities) =>
  entities.valueSeq().toArray()
)

export const selectedIdsSelector = createSelector(stateSelector, (state) =>
  state.selected.toArray()
)

export const selectedEventsListSelector = createSelector(
  selectedIdsSelector,
  entitiesSelector,
  (ids, entities) => ids.map((id) => entities.get(id))
)
/**
 * Action Creators
 * */

export function fetchAllEvents() {
  return {
    type: FETCH_ALL_REQUEST
  }
}

export function toggleSelect(id) {
  return {
    type: TOGGLE_SELECT,
    payload: { id }
  }
}

export function fetchLazy() {
  return {
    type: FETCH_LAZY_REQUEST
  }
}

/**
 * Sagas
 * */

export function* fetchAllSaga() {
  const { loading, loaded } = yield select(stateSelector)
  if (loading || loaded) return

  const ref = firebase.database().ref('events')

  yield put({
    type: FETCH_ALL_START
  })

  const snapshot = yield call([ref, ref.once], 'value')

  yield put({
    type: FETCH_ALL_SUCCESS,
    payload: snapshot.val()
  })
}

export const fetchLazySaga = function*() {
  while (true) {
    yield take(FETCH_LAZY_REQUEST)

    const state = yield select(stateSelector)

    if (state.loading || state.loaded) continue
    //        if (state.loaded) return

    yield put({
      type: FETCH_LAZY_START
    })

    const lastEvent = state.entities.last()

    const ref = firebase
      .database()
      .ref('events')
      .orderByKey()
      .limitToFirst(10)
      .startAt(lastEvent ? lastEvent.id : '')

    const data = yield call([ref, ref.once], 'value')

    yield put({
      type: FETCH_LAZY_SUCCESS,
      payload: data.val()
    })
  }
}

export function* saga() {
  yield all([takeEvery(FETCH_ALL_REQUEST, fetchAllSaga), fetchLazySaga()])
}
