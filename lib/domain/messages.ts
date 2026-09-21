/**
 * Largo máximo de un mensaje del chat. Lo fija la base (`chat_messages.body`
 * tiene un check de 4000) y lo repiten la acción y el campo de texto del chat,
 * que antes no tenía tope: un mensaje más largo se escribía entero y después
 * no se mandaba.
 */
export const CHAT_MESSAGE_MAX = 4000;
