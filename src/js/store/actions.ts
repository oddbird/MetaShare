import { ThunkResult } from '@/store';
import apiFetch, { addUrlParams } from '@/utils/api';
import { ObjectTypes } from '@/utils/constants';

interface CreateObjectPayload {
  objectType: ObjectTypes;
  url: string;
}
interface ObjectPayload extends CreateObjectPayload {
  filters: ObjectFilters;
  reset?: boolean;
}
interface ObjectFilters {
  [key: string]: string;
}
interface ObjectData {
  [key: string]: any;
}
type ObjectResponse = any[];
export interface PaginatedObjectResponse {
  next: string | null;
  results: ObjectResponse;
}

interface FetchObjectsStarted {
  type: 'FETCH_OBJECTS_STARTED';
  payload: ObjectPayload;
}
interface FetchObjectsSucceeded {
  type: 'FETCH_OBJECTS_SUCCEEDED';
  payload: {
    response: PaginatedObjectResponse | ObjectResponse;
  } & ObjectPayload;
}
interface FetchObjectsFailed {
  type: 'FETCH_OBJECTS_FAILED';
  payload: ObjectPayload;
}
interface FetchObjectStarted {
  type: 'FETCH_OBJECT_STARTED';
  payload: ObjectPayload;
}
interface FetchObjectSucceeded {
  type: 'FETCH_OBJECT_SUCCEEDED';
  payload: { object: any } & ObjectPayload;
}
interface FetchObjectFailed {
  type: 'FETCH_OBJECT_FAILED';
  payload: ObjectPayload;
}
interface CreateUpdateObjectStarted {
  type: 'CREATE_OBJECT_STARTED' | 'UPDATE_OBJECT_STARTED';
  payload: { data: ObjectData } & CreateObjectPayload;
}
interface CreateUpdateObjectSucceeded {
  type: 'CREATE_OBJECT_SUCCEEDED' | 'UPDATE_OBJECT_SUCCEEDED';
  payload: {
    data: ObjectData;
    object: any;
  } & CreateObjectPayload;
}
interface CreateUpdateObjectFailed {
  type: 'CREATE_OBJECT_FAILED' | 'UPDATE_OBJECT_FAILED';
  payload: { data: ObjectData } & CreateObjectPayload;
}
interface DeleteObjectAction {
  type:
    | 'DELETE_OBJECT_STARTED'
    | 'DELETE_OBJECT_SUCCEEDED'
    | 'DELETE_OBJECT_FAILED';
  payload: { object: any } & CreateObjectPayload;
}

export type ObjectsAction =
  | FetchObjectsStarted
  | FetchObjectsSucceeded
  | FetchObjectsFailed
  | FetchObjectStarted
  | FetchObjectSucceeded
  | FetchObjectFailed
  | CreateUpdateObjectStarted
  | CreateUpdateObjectSucceeded
  | CreateUpdateObjectFailed
  | DeleteObjectAction;

export type ObjectsActionType = ({
  objectType,
  data,
  url,
  reset,
  filters,
}: {
  objectType: ObjectTypes;
  data?: ObjectData;
  url?: string;
  reset?: boolean;
  filters?: ObjectFilters;
}) => Promise<any>;

export const fetchObjects = ({
  objectType,
  url,
  filters = {},
  reset = false,
  shouldSubscribeToObject = false,
}: {
  objectType: ObjectTypes;
  url?: string;
  filters?: ObjectFilters;
  reset?: boolean;
  shouldSubscribeToObject?: boolean | ((response: any) => boolean);
}): ThunkResult => async (dispatch) => {
  const urlFn = window.api_urls[`${objectType}_list`];
  let baseUrl;
  if (url || urlFn) {
    baseUrl = url || urlFn();
  }
  dispatch({
    type: 'FETCH_OBJECTS_STARTED',
    payload: { objectType, url: baseUrl, reset, filters },
  });
  try {
    if (!baseUrl) {
      throw new Error(`No URL found for object: ${objectType}`);
    }
    const response = await apiFetch({
      url: addUrlParams(baseUrl, { ...filters }),
      dispatch,
    });
    if (window.socket) {
      const arr = Array.isArray(response) ? response : response.results;
      for (const object of arr) {
        const shouldSubscribe =
          (typeof shouldSubscribeToObject === 'boolean' &&
            shouldSubscribeToObject) ||
          (typeof shouldSubscribeToObject === 'function' &&
            shouldSubscribeToObject(object));
        if (object && object.id && shouldSubscribe) {
          window.socket.subscribe({
            model: objectType,
            id: object.id,
          });
        }
      }
    }
    return dispatch({
      type: 'FETCH_OBJECTS_SUCCEEDED',
      payload: { response, objectType, url: baseUrl, reset, filters },
    });
  } catch (err) {
    dispatch({
      type: 'FETCH_OBJECTS_FAILED',
      payload: { objectType, url: baseUrl, reset, filters },
    });
    throw err;
  }
};

export const fetchObject = ({
  objectType,
  url,
  filters = {},
  shouldSubscribeToObject = false,
}: {
  objectType: ObjectTypes;
  url?: string;
  filters?: ObjectFilters;
  shouldSubscribeToObject?: boolean | ((object: any) => boolean);
}): ThunkResult => async (dispatch) => {
  const urlFn = window.api_urls[`${objectType}_list`];
  let baseUrl;
  if (url || urlFn) {
    baseUrl = url || urlFn();
  }
  dispatch({
    type: 'FETCH_OBJECT_STARTED',
    payload: { objectType, url: baseUrl, filters },
  });
  try {
    if (!baseUrl) {
      throw new Error(`No URL found for object: ${objectType}`);
    }
    const response = await apiFetch({
      url: addUrlParams(baseUrl, { ...filters }),
      dispatch,
    });
    const object =
      response && response.results && response.results.length
        ? response.results[0]
        : null;
    const shouldSubscribe =
      (typeof shouldSubscribeToObject === 'boolean' &&
        shouldSubscribeToObject) ||
      (typeof shouldSubscribeToObject === 'function' &&
        shouldSubscribeToObject(object));
    if (object && object.id && window.socket && shouldSubscribe) {
      window.socket.subscribe({
        model: objectType,
        id: object.id,
      });
    }
    return dispatch({
      type: 'FETCH_OBJECT_SUCCEEDED',
      payload: { object, filters, objectType, url: baseUrl },
    });
  } catch (err) {
    dispatch({
      type: 'FETCH_OBJECT_FAILED',
      payload: { filters, objectType, url: baseUrl },
    });
    throw err;
  }
};

export const createObject = ({
  objectType,
  url,
  data = {},
  hasForm = false,
  shouldSubscribeToObject = false,
}: {
  objectType: ObjectTypes;
  url?: string;
  data?: ObjectData;
  hasForm?: boolean;
  shouldSubscribeToObject?: boolean | ((object: any) => boolean);
}): ThunkResult => async (dispatch) => {
  if (!url) {
    const urlFn = window.api_urls[`${objectType}_list`];
    if (urlFn) {
      url = urlFn();
    }
  }
  dispatch({
    type: 'CREATE_OBJECT_STARTED',
    payload: { objectType, url, data },
  });
  try {
    if (!url) {
      throw new Error(`No URL found for object: ${objectType}`);
    }
    const object = await apiFetch({
      url,
      dispatch,
      opts: {
        method: 'POST',
        body: JSON.stringify(data),
        headers: {
          'Content-Type': 'application/json',
        },
      },
      hasForm,
    });
    const shouldSubscribe =
      (typeof shouldSubscribeToObject === 'boolean' &&
        shouldSubscribeToObject) ||
      (typeof shouldSubscribeToObject === 'function' &&
        shouldSubscribeToObject(object));
    if (object && object.id && window.socket && shouldSubscribe) {
      window.socket.subscribe({
        model: objectType,
        id: object.id,
      });
    }
    return dispatch({
      type: 'CREATE_OBJECT_SUCCEEDED',
      payload: { data, object, url, objectType },
    });
  } catch (err) {
    dispatch({
      type: 'CREATE_OBJECT_FAILED',
      payload: { objectType, url, data },
    });
    throw err;
  }
};

export const deleteObject = ({
  objectType,
  object,
  shouldSubscribeToObject = false,
}: {
  objectType: ObjectTypes;
  object: { id: string; [key: string]: any };
  shouldSubscribeToObject?: boolean | ((object: any) => boolean);
}): ThunkResult => async (dispatch) => {
  const urlFn = window.api_urls[`${objectType}_detail`];
  let baseUrl;
  if (urlFn && object.id) {
    baseUrl = urlFn(object.id);
  }
  dispatch({
    type: 'DELETE_OBJECT_STARTED',
    payload: { objectType, url: baseUrl, object },
  });
  try {
    if (!baseUrl) {
      throw new Error(`No URL found for object: ${objectType}`);
    }
    await apiFetch({
      url: baseUrl,
      dispatch,
      opts: { method: 'DELETE' },
    });
    const shouldSubscribe =
      (typeof shouldSubscribeToObject === 'boolean' &&
        shouldSubscribeToObject) ||
      (typeof shouldSubscribeToObject === 'function' &&
        shouldSubscribeToObject(object));
    if (window.socket && shouldSubscribe) {
      window.socket.subscribe({
        model: objectType,
        id: object.id,
      });
    }
    return dispatch({
      type: 'DELETE_OBJECT_SUCCEEDED',
      payload: { objectType, url: baseUrl, object },
    });
  } catch (err) {
    dispatch({
      type: 'DELETE_OBJECT_FAILED',
      payload: { objectType, url: baseUrl, object },
    });
    throw err;
  }
};

export const updateObject = ({
  objectType,
  data,
}: {
  objectType: ObjectTypes;
  data: { id: string; [key: string]: any };
}): ThunkResult => async (dispatch) => {
  const urlFn = window.api_urls[`${objectType}_detail`];
  let baseUrl;
  if (urlFn && data.id) {
    baseUrl = urlFn(data.id);
  }
  dispatch({
    type: 'UPDATE_OBJECT_STARTED',
    payload: { objectType, url: baseUrl, data },
  });
  try {
    if (!baseUrl) {
      throw new Error(`No URL found for object: ${objectType}`);
    }
    const object = await apiFetch({
      url: baseUrl,
      dispatch,
      opts: {
        method: 'PUT',
        body: JSON.stringify(data),
        headers: {
          'Content-Type': 'application/json',
        },
      },
    });
    return dispatch({
      type: 'UPDATE_OBJECT_SUCCEEDED',
      payload: { objectType, url: baseUrl, data, object },
    });
  } catch (err) {
    dispatch({
      type: 'UPDATE_OBJECT_FAILED',
      payload: { objectType, url: baseUrl, data },
    });
    throw err;
  }
};
