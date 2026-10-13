import { Modal, type ModalProps } from "react-native";

export function AppModal(props: ModalProps) {
  if (props.visible === false) return null;
  return <Modal {...props} />;
}
