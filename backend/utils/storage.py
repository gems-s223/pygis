from typing import Optional

_layers: dict[str, dict] = {}


def store_layer(layer_id: str, record: dict) -> None:
    _layers[layer_id] = record


def get_layer(layer_id: str) -> Optional[dict]:
    return _layers.get(layer_id)


def list_layers() -> dict:
    return _layers


def delete_layer(layer_id: str) -> bool:
    if layer_id in _layers:
        del _layers[layer_id]
        return True
    return False
