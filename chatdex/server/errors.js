// API error catalogue. Responses carry a stable `code` (+ `params`) that the client translates;
// `error` holds the English text for API consumers and as a fallback.
export const ERRORS = {
  notFound: 'Not found.',
  loginRequired: 'Please log in to continue.',
  uploadTooLarge: 'This upload is too large.',
  malformed: 'Malformed request.',
  server: 'Something went wrong on our side. Please try again.',
  fieldRequired: '{field} is required.',
  fieldTooShort: '{field} must be at least {min} characters.',
  fieldTooLong: '{field} must be at most {max} characters.',
  photoRequired: 'A photo is required.',
  photoType: 'This file is not a supported photo (JPEG, PNG or WebP).',
  photoEmpty: 'This photo looks empty or corrupted.',
  photoTooLarge: 'This photo is too large (max 6 MB).',
  photoCorrupted: 'This photo looks corrupted.',
  userNotFound: 'This hunter does not exist.',
  emailInvalid: 'Please enter a valid email address.',
  passwordShort: 'Password must be at least 6 characters.',
  usernameChars: 'Username can only contain letters, numbers and underscores.',
  guidelines: 'Please accept the Respect the Cats guidelines.',
  emailTaken: 'An account with this email already exists.',
  usernameTaken: 'This username is taken.',
  wrongCredentials: 'Wrong email or password.',
  favoriteNotCollected: 'Your favourite cat must be in your collection.',
  followSelf: "You can't follow yourself.",
  catNotFound: 'This cat could not be found. It may have been removed.',
  tagChars: 'Tags can only contain letters, numbers and spaces.',
  coatRequired: 'Please choose a coat colour.',
  patternRequired: 'Please choose a coat pattern.',
  locationRequired: 'We need an approximate location. Turn on location or pick your area.',
  unknownReaction: 'Unknown reaction.',
  captureNotFound: 'This capture no longer exists.',
  invalidReport: 'Invalid report.',
  nothingToReport: 'Nothing to report here.',
  huntWhere: 'Choose where the hunt takes place.',
  huntNotFound: 'This hunt does not exist.',
  huntEnded: 'This hunt has already ended.',
  unknownRoute: 'Unknown API route.',
  wrongPassword: 'Wrong password.',
};

export const FIELDS = {
  email: 'Email', username: 'Username', displayName: 'Display name', bio: 'Bio', avatar: 'Avatar', search: 'Search',
  tag: 'Tag', catName: 'Cat name', reason: 'Reason', title: 'Title', area: 'Area',
};

export const format = (code, params = {}) =>
  (ERRORS[code] || code).replace(/\{(\w+)\}/g, (_, k) => (k === 'field' ? FIELDS[params.field] || params.field : params[k] ?? ''));

export const errorBody = (code, params) => ({ error: format(code, params), code, ...(params ? { params } : {}) });
