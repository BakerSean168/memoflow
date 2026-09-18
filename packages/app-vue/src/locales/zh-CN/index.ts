import common from './common';
import errors from './errors';
import menu from './menu';
import nav from './nav';
import account from './account';
import auth from './auth';
import shell from './shell';
import aiAssistant from './aiAssistant';
import goal from './goal';
import task from './task';
import schedule from './schedule';
import notification from './notification';
import repository from './repository';
import governance from './governance';
import setting from './setting';

export default {
  common,
  errors,
  menu,
  nav,
  account,
  auth,
  shell,
  aiAssistant,
  goal,
  task,
  schedule,
  notification,
  repository,
  governance,
  setting,
} as const;
