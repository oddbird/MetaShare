import { ThunkDispatch } from 'redux-thunk';
import Sockette from 'sockette';

import {
  commitFailed,
  commitSucceeded,
  deleteFailed,
  deleteOrg,
  orgRefreshed,
  provisionFailed,
  provisionOrg,
  refreshError,
  updateFailed,
  updateOrg,
} from '@/store/orgs/actions';
import { MinimalOrg, Org } from '@/store/orgs/reducer';
import {
  createProjectPR,
  createProjectPRFailed,
  updateProject,
} from '@/store/projects/actions';
import { Project } from '@/store/projects/reducer';
import {
  repoError,
  reposRefreshed,
  updateRepo,
} from '@/store/repositories/actions';
import { Repository } from '@/store/repositories/reducer';
import { connectSocket, disconnectSocket } from '@/store/socket/actions';
import {
  createTaskPR,
  createTaskPRFailed,
  submitReview,
  submitReviewFailed,
  updateTask,
} from '@/store/tasks/actions';
import { Task } from '@/store/tasks/reducer';
import {
  ObjectTypes,
  WEBSOCKET_ACTIONS,
  WebsocketActions,
} from '@/utils/constants';
import { log } from '@/utils/logging';

export interface Socket {
  subscribe: (payload: Subscription) => void;
  unsubscribe: (payload: Subscription) => void;
  reconnect: () => void;
}

interface Subscription {
  action?: WebsocketActions;
  model: ObjectTypes;
  id: string;
}

interface SubscriptionEvent {
  ok?: string;
  error?: string;
}
interface ErrorEvent {
  type: 'BACKEND_ERROR';
  payload: { message: string };
}
interface ReposRefreshedEvent {
  type: 'USER_REPOS_REFRESH';
}
interface RepoUpdatedEvent {
  type: 'REPOSITORY_UPDATE';
  payload: {
    model: Repository;
    originating_user_id: string | null;
  };
}
interface RepoUpdateErrorEvent {
  type: 'REPOSITORY_UPDATE_ERROR';
  payload: {
    message?: string;
    model: Repository;
    originating_user_id: string | null;
  };
}
interface ProjectUpdatedEvent {
  type: 'PROJECT_UPDATE';
  payload: {
    model: Project;
    originating_user_id: string | null;
  };
}
interface ProjectCreatePREvent {
  type: 'PROJECT_CREATE_PR';
  payload: {
    model: Project;
    originating_user_id: string | null;
  };
}
interface ProjectCreatePRFailedEvent {
  type: 'PROJECT_CREATE_PR_FAILED';
  payload: {
    message?: string;
    model: Project;
    originating_user_id: string | null;
  };
}
interface TaskUpdatedEvent {
  type: 'TASK_UPDATE';
  payload: {
    model: Task;
    originating_user_id: string | null;
  };
}
interface TaskCreatePREvent {
  type: 'TASK_CREATE_PR';
  payload: {
    model: Task;
    originating_user_id: string | null;
  };
}
interface TaskCreatePRFailedEvent {
  type: 'TASK_CREATE_PR_FAILED';
  payload: {
    message?: string;
    model: Task;
    originating_user_id: string | null;
  };
}
interface TaskSubmitReviewEvent {
  type: 'TASK_SUBMIT_REVIEW';
  payload: {
    model: Task;
    originating_user_id: string | null;
  };
}
interface TaskSubmitReviewFailedEvent {
  type: 'TASK_SUBMIT_REVIEW_FAILED';
  payload: {
    message?: string;
    model: Task;
    originating_user_id: string | null;
  };
}
interface OrgProvisionedEvent {
  type: 'SCRATCH_ORG_PROVISION';
  payload: {
    model: Org;
    originating_user_id: string | null;
  };
}
interface OrgProvisionFailedEvent {
  type: 'SCRATCH_ORG_PROVISION_FAILED';
  payload: {
    message?: string;
    model: Org | MinimalOrg;
    originating_user_id: string | null;
  };
}
interface OrgUpdatedEvent {
  type: 'SCRATCH_ORG_UPDATE';
  payload: {
    model: Org;
    originating_user_id: string | null;
  };
}
interface OrgUpdateFailedEvent {
  type: 'SCRATCH_ORG_FETCH_CHANGES_FAILED';
  payload: {
    message?: string;
    model: Org;
    originating_user_id: string | null;
  };
}
interface OrgDeletedEvent {
  type: 'SCRATCH_ORG_DELETE';
  payload: {
    model: Org | MinimalOrg;
    originating_user_id: string | null;
  };
}
interface OrgDeleteFailedEvent {
  type: 'SCRATCH_ORG_DELETE_FAILED';
  payload: {
    message?: string;
    model: Org;
    originating_user_id: string | null;
  };
}
interface OrgRemovedEvent {
  type: 'SCRATCH_ORG_REMOVE';
  payload: {
    message?: string;
    model: Org | MinimalOrg;
    originating_user_id: string | null;
  };
}
interface OrgRefreshedEvent {
  type: 'SCRATCH_ORG_REFRESH';
  payload: {
    model: Org;
    originating_user_id: string | null;
  };
}
interface OrgRefreshFailedEvent {
  type: 'SCRATCH_ORG_REFRESH_FAILED';
  payload: {
    message?: string;
    model: Org | MinimalOrg;
    originating_user_id: string | null;
  };
}
interface CommitSucceededEvent {
  type: 'SCRATCH_ORG_COMMIT_CHANGES';
  payload: {
    model: Org;
    originating_user_id: string | null;
  };
}
interface CommitFailedEvent {
  type: 'SCRATCH_ORG_COMMIT_CHANGES_FAILED';
  payload: {
    message?: string;
    model: Org;
    originating_user_id: string | null;
  };
}
type ModelEvent =
  | RepoUpdatedEvent
  | RepoUpdateErrorEvent
  | ProjectUpdatedEvent
  | ProjectCreatePREvent
  | ProjectCreatePRFailedEvent
  | TaskUpdatedEvent
  | TaskCreatePREvent
  | TaskCreatePRFailedEvent
  | TaskSubmitReviewEvent
  | TaskSubmitReviewFailedEvent
  | OrgProvisionedEvent
  | OrgProvisionFailedEvent
  | OrgUpdatedEvent
  | OrgUpdateFailedEvent
  | OrgDeletedEvent
  | OrgDeleteFailedEvent
  | OrgRemovedEvent
  | OrgRefreshedEvent
  | OrgRefreshFailedEvent
  | CommitSucceededEvent
  | CommitFailedEvent;
type EventType =
  | SubscriptionEvent
  | ModelEvent
  | ErrorEvent
  | ReposRefreshedEvent;

const isSubscriptionEvent = (event: EventType): event is SubscriptionEvent =>
  (event as ModelEvent).type === undefined;

const hasModel = (event: ModelEvent) => Boolean(event?.payload?.model);

export const getAction = (event: EventType) => {
  if (!event || isSubscriptionEvent(event)) {
    return null;
  }
  switch (event.type) {
    case 'USER_REPOS_REFRESH':
      return reposRefreshed();
    case 'REPOSITORY_UPDATE':
      return hasModel(event) && updateRepo(event.payload.model);
    case 'REPOSITORY_UPDATE_ERROR':
      return hasModel(event) && repoError(event.payload);
    case 'PROJECT_UPDATE':
      return hasModel(event) && updateProject(event.payload.model);
    case 'PROJECT_CREATE_PR':
      return hasModel(event) && createProjectPR(event.payload);
    case 'PROJECT_CREATE_PR_FAILED':
      return hasModel(event) && createProjectPRFailed(event.payload);
    case 'TASK_UPDATE':
      return hasModel(event) && updateTask(event.payload.model);
    case 'TASK_CREATE_PR':
      return hasModel(event) && createTaskPR(event.payload);
    case 'TASK_CREATE_PR_FAILED':
      return hasModel(event) && createTaskPRFailed(event.payload);
    case 'TASK_SUBMIT_REVIEW':
      return hasModel(event) && submitReview(event.payload);
    case 'TASK_SUBMIT_REVIEW_FAILED':
      return hasModel(event) && submitReviewFailed(event.payload);
    case 'SCRATCH_ORG_PROVISION':
      return hasModel(event) && provisionOrg(event.payload);
    case 'SCRATCH_ORG_PROVISION_FAILED':
      return hasModel(event) && provisionFailed(event.payload);
    case 'SCRATCH_ORG_UPDATE':
      return hasModel(event) && updateOrg(event.payload.model);
    case 'SCRATCH_ORG_FETCH_CHANGES_FAILED':
      return hasModel(event) && updateFailed(event.payload);
    case 'SCRATCH_ORG_DELETE':
      return hasModel(event) && deleteOrg(event.payload);
    case 'SCRATCH_ORG_REMOVE':
      return hasModel(event) && deleteOrg(event.payload);
    case 'SCRATCH_ORG_DELETE_FAILED':
      return hasModel(event) && deleteFailed(event.payload);
    case 'SCRATCH_ORG_REFRESH':
      return hasModel(event) && orgRefreshed(event.payload);
    case 'SCRATCH_ORG_REFRESH_FAILED':
      return hasModel(event) && refreshError(event.payload);
    case 'SCRATCH_ORG_COMMIT_CHANGES':
      return hasModel(event) && commitSucceeded(event.payload);
    case 'SCRATCH_ORG_COMMIT_CHANGES_FAILED':
      return hasModel(event) && commitFailed(event.payload);
  }
  return null;
};

export const createSocket = ({
  url,
  options = {},
  dispatch,
}: {
  url: string;
  options?: { [key: string]: any };
  dispatch: ThunkDispatch<any, any, any>;
}): Socket | null => {
  /* istanbul ignore if */
  if (!(url && dispatch)) {
    return null;
  }
  const defaults = {
    timeout: 1000,
    maxAttempts: Infinity,
    /* eslint-disable @typescript-eslint/no-unused-vars */
    onopen: (e?: Event) => {},
    onmessage: (e?: Event) => {},
    onreconnect: (e?: Event) => {},
    onmaximum: (e?: Event) => {},
    onclose: (e?: Event) => {},
    onerror: (e?: Event) => {},
    /* eslint-enable @typescript-eslint/no-unused-vars */
  };
  const opts = { ...defaults, ...options };

  let open = false;
  let lostConnection = false;
  const pending = new Set();

  const socket = new Sockette(url, {
    timeout: opts.timeout,
    maxAttempts: opts.maxAttempts,
    onopen: (e) => {
      dispatch(connectSocket());
      open = true;
      for (const payload of pending) {
        log('[WebSocket] subscribing to:', payload);
        socket.json(payload);
      }
      pending.clear();
      if (lostConnection) {
        lostConnection = false;
        log('[WebSocket] reconnected');
        opts.onreconnect(e);
      } else {
        log('[WebSocket] connected');
        opts.onopen(e);
      }
    },
    onmessage: (e) => {
      let data = e.data;
      try {
        data = JSON.parse(e.data);
      } catch (err) {
        // swallow error
      }
      log('[WebSocket] received:', data);
      const action = getAction(data);
      if (action) {
        dispatch(action);
      }
      opts.onmessage(e);
    },
    onreconnect: () => {
      log('[WebSocket] attempting to reconnect…');
      if (!lostConnection) {
        lostConnection = true;
      }
    },
    onmaximum: (e) => {
      log(`[WebSocket] ending reconnect after ${opts.maxAttempts} attempts`);
      opts.onmaximum(e);
    },
    onclose: (e) => {
      log('[WebSocket] closed');
      if (open) {
        open = false;
        setTimeout(() => {
          if (!open) {
            dispatch(disconnectSocket());
          }
        }, 5000);
      }
      opts.onclose(e);
    },
    onerror: (e) => {
      log('[WebSocket] error');
      opts.onerror(e);
    },
  });

  const subscribe = (data: Subscription) => {
    const payload = { ...data, action: WEBSOCKET_ACTIONS.SUBSCRIBE };
    if (open) {
      log('[WebSocket] subscribing to:', payload);
      socket.json(payload);
    } else {
      pending.add(payload);
    }
  };

  const unsubscribe = (data: Subscription) => {
    const payload = { ...data, action: WEBSOCKET_ACTIONS.UNSUBSCRIBE };
    if (open) {
      log('[WebSocket] unsubscribing from:', payload);
      socket.json(payload);
    } else {
      pending.add(payload);
    }
  };

  let reconnecting: NodeJS.Timeout | undefined;
  const clearReconnect = () => {
    /* istanbul ignore else */
    if (reconnecting) {
      clearInterval(reconnecting);
      reconnecting = undefined;
    }
  };

  const reconnect = () => {
    socket.close(1000, 'user logged out');
    // Without polling, the `onopen` callback after reconnect could fire before
    // the `onclose` callback...
    reconnecting = setInterval(() => {
      if (!open) {
        socket.open();
        clearReconnect();
      }
    }, 500);
  };

  return {
    subscribe,
    unsubscribe,
    reconnect,
  };
};
