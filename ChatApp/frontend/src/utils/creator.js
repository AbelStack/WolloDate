export const CREATOR_USERNAME = 'abel'

export const isCreatorUser = (candidate) => {
  const username = String(candidate?.username || '').trim().toLowerCase()
  return username === CREATOR_USERNAME
}
